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
});
