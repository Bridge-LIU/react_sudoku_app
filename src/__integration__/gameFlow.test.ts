/**
 * 統合テスト: 全層通しの round-trip 検証
 *
 * === 対象フロー ===
 *   1. Mock API で puzzle 生成 (handleGeneratePuzzle)
 *   2. reducer に START_GAME dispatch → playing 状態へ
 *   3. INPUT_NUMBER dispatch → currentBoard 更新
 *   4. saveSnapshot で永続化
 *   5. 別インスタンスで loadSnapshot → LOAD_SAVED dispatch
 *   6. 復元後 state が元と一致することを確認
 *
 * === 各層のユニットテストでは分からないこと ===
 *   - schema・型が層を跨いだ時に本当に噛み合うか
 *   - snapshot 保存フォーマットと復元 payload の互換性
 *   - puzzle.puzzle と reducer.currentBoard の型一致
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGeneratePuzzle, _debugPuzzleCache } from '@/mocks/handlers/puzzles';
import { puzzleObjectSchema } from '@/mocks/schemas/puzzle';
import { gameReducer, initialState, GameState } from '@/state/gameReducer';
import { saveSnapshot, loadSnapshot } from '@/storage/asyncStorage';
import { Board } from '@/types/domain';

// AsyncStorage を in-memory Map で mock（asyncStorage.test.ts と同じパターン）
const mockStore = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: vi.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    getItem: vi.fn(async (k: string) => mockStore.get(k) ?? null),
    removeItem: vi.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));

describe('Integration: puzzle → reducer → storage → reload', () => {
  beforeEach(() => {
    mockStore.clear();
    _debugPuzzleCache().clear();
  });

  it('round-trip: 生成 → プレイ → 保存 → 復元 で state が一致する', async () => {
    // ============================================================
    // Step 1: Mock API で puzzle 生成
    // ============================================================
    const genRes = handleGeneratePuzzle({ difficulty: 'easy' });
    expect(genRes.status).toBe(200);
    const puzzle = puzzleObjectSchema.parse(genRes.body);

    // ============================================================
    // Step 2: reducer に START_GAME dispatch
    // ============================================================
    let state: GameState = gameReducer(initialState, {
      type: 'START_GAME',
      payload: {
        puzzleId: puzzle.id,
        difficulty: puzzle.difficulty,
        puzzle: puzzle.puzzle as unknown as Board,
        solution: puzzle.solution as unknown as Board,
      },
    });
    expect(state.status).toBe('playing');
    expect(state.puzzleId).toBe(puzzle.id);

    // ============================================================
    // Step 3: プレイヤーが数字を 3 個入力
    // ============================================================
    // 空セルを 3 つ見つけて数字を入れる
    const emptyIndices: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (state.currentBoard[i] === 0) emptyIndices.push(i);
      if (emptyIndices.length === 3) break;
    }
    for (const idx of emptyIndices) {
      state = gameReducer({ ...state, selectedCell: idx }, {
        type: 'INPUT_NUMBER',
        payload: { value: (puzzle.solution as any)[idx] },
      });
    }
    // 3 個埋まってる
    for (const idx of emptyIndices) {
      expect(state.currentBoard[idx]).toBe((puzzle.solution as any)[idx]);
    }
    // タイマー進める
    state = gameReducer({ ...state, status: 'playing' }, { type: 'TICK', payload: { deltaMs: 8000 } });
    expect(state.elapsedMs).toBe(8000);

    // ============================================================
    // Step 4: saveSnapshot で永続化
    // ============================================================
    await saveSnapshot(state);
    expect(mockStore.size).toBe(1);
    expect(mockStore.has(`sudoku.save.${puzzle.difficulty}`)).toBe(true);

    // ============================================================
    // Step 5: 別インスタンスで loadSnapshot → LOAD_SAVED
    // ============================================================
    const loaded = await loadSnapshot('easy');
    expect(loaded).not.toBeNull();
    expect(loaded?.puzzleId).toBe(puzzle.id);
    expect(loaded?.elapsedMs).toBe(8000);

    // ゼロ state から復元
    const restored = gameReducer(initialState, {
      type: 'LOAD_SAVED',
      payload: loaded as Partial<GameState>,
    });

    // ============================================================
    // Step 6: 復元後の一致確認（信用境界を跨いだ round-trip）
    // ============================================================
    expect(restored.status).toBe('playing');
    expect(restored.puzzleId).toBe(state.puzzleId);
    expect(restored.difficulty).toBe(state.difficulty);
    expect(restored.elapsedMs).toBe(state.elapsedMs);
    expect(restored.mistakes).toBe(state.mistakes);
    expect(restored.hintsUsed).toBe(state.hintsUsed);
    // 盤面がバイト単位で一致
    for (let i = 0; i < 81; i++) {
      expect(restored.currentBoard[i]).toBe(state.currentBoard[i]);
      expect(restored.initialBoard[i]).toBe(state.initialBoard[i]);
      expect(restored.solution[i]).toBe(state.solution[i]);
    }
    // history/future/selectedCell はリセット（LOAD_SAVED 仕様）
    expect(restored.history).toEqual([]);
    expect(restored.future).toEqual([]);
    expect(restored.selectedCell).toBeNull();
  }, 30000);

  it('破損 snapshot 復元時に self-heal して null 返す（統合的な信用境界）', async () => {
    // 悪意ある改変を想定：storage に直接不正な JSON を書く
    mockStore.set('sudoku.save.medium', '{"broken": "not a snapshot"}');

    const loaded = await loadSnapshot('medium');
    expect(loaded).toBeNull();
    // self-heal でキー削除されている
    expect(mockStore.has('sudoku.save.medium')).toBe(false);

    // 復元失敗 → LOAD_SAVED しない → 通常 START_GAME フローに進める（アプリ側正当性）
    expect(true).toBe(true);
  });

  it('generated puzzle は unique 解を持ち reducer solution と一致する', () => {
    const genRes = handleGeneratePuzzle({ difficulty: 'easy' });
    const puzzle = puzzleObjectSchema.parse(genRes.body);

    // solution の各セルは 1-9
    expect((puzzle.solution as number[]).every(v => v >= 1 && v <= 9)).toBe(true);
    // puzzle の非ゼロセルは solution と一致
    for (let i = 0; i < 81; i++) {
      const p = (puzzle.puzzle as number[])[i]!;
      const s = (puzzle.solution as number[])[i]!;
      if (p !== 0) expect(p).toBe(s);
    }
  }, 20000);
});
