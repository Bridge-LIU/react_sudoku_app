import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidSnapshot, saveSnapshot, loadSnapshot, clearSnapshot } from './asyncStorage';
import { GameState } from '@/state/gameReducer';

// ============================================================
// AsyncStorage in-memory モック
// ============================================================
const mockStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    getItem: vi.fn(async (k: string) => mockStore.get(k) ?? null),
    removeItem: vi.fn(async (k: string) => { mockStore.delete(k); }),
  }
}));

// 有効な数独解 (行 = 1..9 を全 9 行で circular shift、ブロック則を満たすシャッフル)
const validSolutionArr: number[] = (() => {
  const rowBase = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shifts = [0, 3, 6, 1, 4, 7, 2, 5, 8];   // 数独有効な行シフト順
  const board: number[] = [];
  for (const s of shifts) {
    for (let c = 0; c < 9; c++) board.push(rowBase[(c + s) % 9]!);
  }
  return board;
})();

// initialBoard / currentBoard は全 0 (空盤面) でも valid
const validBoardArr = new Array(81).fill(0);
const validBoard = validBoardArr;

const validSnap = {
  puzzleId: 'p1',
  difficulty: 'easy',
  initialBoard: validBoard,
  currentBoard: validBoard,
  solution: validSolutionArr,
  notes: {},
  elapsedMs: 0,
  mistakes: 0,
  hintsUsed: 0,
  savedAt: '2026-07-24T00:00:00Z',
};

describe('isValidSnapshot', () => {
  it('accepts valid snapshot', () => {
    expect(isValidSnapshot(validSnap)).toBe(true);
  });
  it('rejects wrong difficulty', () => {
    expect(isValidSnapshot({ ...validSnap, difficulty: 'insane' })).toBe(false);
  });
  it('rejects board length !== 81', () => {
    expect(isValidSnapshot({ ...validSnap, currentBoard: [0, 0, 0] })).toBe(false);
  });
  it('rejects board with out-of-range', () => {
    const bad = [...validBoard]; bad[0] = 10;
    expect(isValidSnapshot({ ...validSnap, currentBoard: bad })).toBe(false);
  });
  it('rejects notes with bad keys', () => {
    expect(isValidSnapshot({ ...validSnap, notes: { '999': [1] } })).toBe(false);
  });
  it('rejects notes with bad values', () => {
    expect(isValidSnapshot({ ...validSnap, notes: { '3': [10] } })).toBe(false);
  });
  it('rejects negative elapsedMs', () => {
    expect(isValidSnapshot({ ...validSnap, elapsedMs: -1 })).toBe(false);
  });
  it('rejects null', () => {
    expect(isValidSnapshot(null)).toBe(false);
  });
  it('rejects solution containing 0 (伪完成攻撃防止)', () => {
    const badSol = [...validSolutionArr]; badSol[0] = 0;
    expect(isValidSnapshot({ ...validSnap, solution: badSol })).toBe(false);
  });
  it('rejects all-zero solution', () => {
    expect(isValidSnapshot({ ...validSnap, solution: new Array(81).fill(0) })).toBe(false);
  });
  it('rejects when initialBoard cell does not match solution (盤面不整合)', () => {
    const init = new Array(81).fill(0); init[0] = 9;
    const cur = [...init];
    // solution[0] は validSolutionArr[0]===1 なので、9 !== 1 で拒否
    expect(isValidSnapshot({
      ...validSnap, initialBoard: init, currentBoard: cur,
    })).toBe(false);
  });
  it('rejects when currentBoard tampered with initial cell', () => {
    const init = new Array(81).fill(0); init[0] = validSolutionArr[0];
    const cur = [...init]; cur[0] = 5;  // 初期セルが書き換えられている
    expect(isValidSnapshot({
      ...validSnap, initialBoard: init, currentBoard: cur,
    })).toBe(false);
  });
});

// ============================================================
// I/O 系テスト（saveSnapshot / loadSnapshot / clearSnapshot）
// ============================================================
const validGameState = {
  puzzleId: 'p_test',
  difficulty: 'easy' as const,
  initialBoard: validBoardArr,
  currentBoard: validBoardArr,
  solution: validSolutionArr,
  notes: {},
  elapsedMs: 5000,
  mistakes: 1,
  hintsUsed: 0,
} as unknown as GameState;

describe('saveSnapshot / loadSnapshot round-trip', () => {
  beforeEach(() => { mockStore.clear(); });

  it('save then load returns equivalent snapshot', async () => {
    await saveSnapshot(validGameState);
    const loaded = await loadSnapshot('easy');
    expect(loaded).not.toBeNull();
    expect(loaded?.puzzleId).toBe('p_test');
    expect(loaded?.difficulty).toBe('easy');
    expect(loaded?.elapsedMs).toBe(5000);
    expect(loaded?.mistakes).toBe(1);
    expect(loaded?.savedAt).toBeDefined();
  });

  it('saveSnapshot no-op when difficulty is null', async () => {
    await saveSnapshot({ ...validGameState, difficulty: null } as any);
    expect(mockStore.size).toBe(0);
  });

  it('saveSnapshot no-op when puzzleId is null', async () => {
    await saveSnapshot({ ...validGameState, puzzleId: null } as any);
    expect(mockStore.size).toBe(0);
  });

  it('loadSnapshot returns null when key does not exist', async () => {
    const loaded = await loadSnapshot('hard');
    expect(loaded).toBeNull();
  });

  it('loadSnapshot self-heals corrupt JSON', async () => {
    mockStore.set('sudoku.save.easy', '{ not: valid json ');
    const loaded = await loadSnapshot('easy');
    expect(loaded).toBeNull();
    // 破損キーは削除されている
    expect(mockStore.has('sudoku.save.easy')).toBe(false);
  });

  it('loadSnapshot self-heals schema-invalid data', async () => {
    // JSON はパースできるが snapshot として不正（difficulty が不正値）
    mockStore.set('sudoku.save.medium', JSON.stringify({
      ...validSnap,
      difficulty: 'insane',
    }));
    const loaded = await loadSnapshot('medium');
    expect(loaded).toBeNull();
    expect(mockStore.has('sudoku.save.medium')).toBe(false);
  });

  it('clearSnapshot removes existing entry', async () => {
    mockStore.set('sudoku.save.hard', JSON.stringify(validSnap));
    await clearSnapshot('hard');
    expect(mockStore.has('sudoku.save.hard')).toBe(false);
  });

  it('save uses difficulty-specific key (multiple slots)', async () => {
    await saveSnapshot({ ...validGameState, difficulty: 'easy' });
    await saveSnapshot({ ...validGameState, difficulty: 'medium' });
    await saveSnapshot({ ...validGameState, difficulty: 'hard' });
    expect(mockStore.has('sudoku.save.easy')).toBe(true);
    expect(mockStore.has('sudoku.save.medium')).toBe(true);
    expect(mockStore.has('sudoku.save.hard')).toBe(true);
    // 各スロット独立に load できる
    expect((await loadSnapshot('easy'))?.difficulty).toBe('easy');
    expect((await loadSnapshot('medium'))?.difficulty).toBe('medium');
    expect((await loadSnapshot('hard'))?.difficulty).toBe('hard');
  });
});
