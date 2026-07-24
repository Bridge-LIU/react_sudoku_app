import { describe, it, expect } from 'vitest';
import { isValidSnapshot } from './asyncStorage';

const validBoard = new Array(81).fill(0);

const validSnap = {
  puzzleId: 'p1',
  difficulty: 'easy',
  initialBoard: validBoard,
  currentBoard: validBoard,
  solution: validBoard,
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
});
