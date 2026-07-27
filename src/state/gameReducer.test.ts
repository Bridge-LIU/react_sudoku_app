import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from './gameReducer';
import { Board } from '@/types/domain';

const emptyBoard: Board = new Array(81).fill(0);

describe('gameReducer', () => {
  it('START_GAME sets boards and status', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const solution: Board = [...emptyBoard]; (solution as any)[0] = 5;
    const s = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution },
    });
    expect(s.status).toBe('playing');
    expect(s.initialBoard[0]).toBe(5);
    expect(s.currentBoard[0]).toBe(5);
  });

  it('INPUT_NUMBER on initial cell is a no-op', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s = gameReducer({ ...start, selectedCell: 0 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    expect(s.currentBoard[0]).toBe(5);
  });

  it('INPUT_NUMBER on empty cell writes value and pushes history', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.currentBoard[5]).toBe(3);
    expect(s.history.length).toBe(1);
  });

  it('UNDO reverts last input', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    expect(s2.currentBoard[5]).toBe(0);
    expect(s2.future.length).toBe(1);
  });

  it('REDO reapplies undone action', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    const s3 = gameReducer(s2, { type: 'REDO' });
    expect(s3.currentBoard[5]).toBe(3);
  });

  it('TOGGLE_MODE flips memo mode', () => {
    const s = gameReducer(initialState, { type: 'TOGGLE_MODE' });
    expect(s.mode).toBe('memo');
  });

  it('INPUT_NUMBER in memo mode toggles note', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    let s = gameReducer({ ...start, selectedCell: 0, mode: 'memo' }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.notes[0]).toEqual([3]);
    s = gameReducer(s, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.notes[0]).toEqual([]);
  });

  it('RESET_CONFIRMED restores initialBoard and clears history', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s1 = gameReducer({ ...start, selectedCell: 1 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    const s2 = gameReducer(s1, { type: 'RESET_CONFIRMED' });
    expect(s2.currentBoard[1]).toBe(0);
    expect(s2.currentBoard[0]).toBe(5); // 初期値は残る
    expect(s2.history.length).toBe(0);
    expect(s2.mistakes).toBe(0);
  });

  it('TICK adds elapsedMs only when playing', () => {
    const s1 = gameReducer({ ...initialState, status: 'playing' }, { type: 'TICK', payload: { deltaMs: 1000 } });
    expect(s1.elapsedMs).toBe(1000);
    const s2 = gameReducer({ ...initialState, status: 'paused' }, { type: 'TICK', payload: { deltaMs: 1000 } });
    expect(s2.elapsedMs).toBe(0);
  });

  it('REDO stack cleared after new INPUT', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    expect(s2.future.length).toBe(1);
    const s3 = gameReducer({ ...s2, selectedCell: 10 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    expect(s3.future.length).toBe(0); // 新規操作で future クリア
  });

  it('UNDO on empty history returns same state', () => {
    const s = gameReducer(initialState, { type: 'UNDO' });
    expect(s).toEqual(initialState);
  });

  it('HINT_RECEIVED with out-of-bounds index is rejected', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s = gameReducer(start, { type: 'HINT_RECEIVED', payload: { index: 100, number: 5 } as any });
    expect(s.lastHintRejection?.reason).toBe('BAD_INDEX');
  });

  it('HINT_RECEIVED with bad number is rejected', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s = gameReducer(start, { type: 'HINT_RECEIVED', payload: { index: 0, number: 0 } as any });
    expect(s.lastHintRejection?.reason).toBe('BAD_NUMBER');
  });

  it('HINT_RECEIVED on already-filled cell is ignored', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s = gameReducer(start, { type: 'HINT_RECEIVED', payload: { index: 0, number: 3 as any } });
    expect(s.hintsUsed).toBe(0);
    expect(s.pendingHint).toBeNull();
  });

  it('HISTORY_LIMIT caps at 100', () => {
    let s = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    for (let i = 0; i < 150; i++) {
      s = gameReducer({ ...s, selectedCell: i % 81 }, { type: 'INPUT_NUMBER', payload: { value: 1 } });
    }
    expect(s.history.length).toBeLessThanOrEqual(100);
  });

  it('autoRemoveNotes: peer notes cleared on placement', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    // Cell 0 と Cell 1 に memo で 5 を入れる
    let s = gameReducer({ ...start, selectedCell: 0, mode: 'memo' }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    s = gameReducer({ ...s, selectedCell: 1 }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    expect(s.notes[0]).toEqual([5]);
    expect(s.notes[1]).toEqual([5]);
    // Cell 2 に通常入力で 5 → Cell 0 と Cell 1 の memo 5 が消える（同じ行）
    s = gameReducer({ ...s, selectedCell: 2, mode: 'input' }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    expect(s.notes[0]).toBeUndefined();
    expect(s.notes[1]).toBeUndefined();
  });

  it('RESTART_REQUESTED resets to idle while keeping settings', () => {
    // 完成状態 + カスタム設定 から出発
    const withCustomSettings = {
      ...initialState,
      status: 'complete' as const,
      settings: { showMistakesImmediately: false, autoRemoveNotes: false, language: 'zh' as const },
      elapsedMs: 12345,
      mistakes: 3,
      hintsUsed: 2,
    };
    const s = gameReducer(withCustomSettings, { type: 'RESTART_REQUESTED' });
    // 状態は初期化されるが settings は保持
    expect(s.status).toBe('idle');
    expect(s.difficulty).toBeNull();
    expect(s.elapsedMs).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.hintsUsed).toBe(0);
    expect(s.settings).toEqual(withCustomSettings.settings);
  });
});
