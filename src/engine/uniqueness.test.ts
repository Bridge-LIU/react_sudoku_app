import { describe, it, expect } from 'vitest';
import { hasUniqueSolution } from './uniqueness';
import { Board } from '@/types/domain';

const boardFromString = (s: string): Board =>
  s.replace(/\s/g, '').split('').map(c => (c === '.' ? 0 : parseInt(c, 10))) as Board;

describe('hasUniqueSolution', () => {
  it('returns true for known unique puzzle', () => {
    const b = boardFromString('53..7.... 6..195... .98....6. 8...6...3 4..8.3..1 7...2...6 .6....28. ...419..5 ....8..79');
    expect(hasUniqueSolution(b)).toBe(true);
  });
  it('returns false for empty board (many solutions)', () => {
    expect(hasUniqueSolution(new Array(81).fill(0) as Board)).toBe(false);
  });
  it('returns false for unsolvable', () => {
    const b = new Array(81).fill(0) as any; b[0] = 1; b[1] = 1;
    expect(hasUniqueSolution(b as Board)).toBe(false);
  });
});
