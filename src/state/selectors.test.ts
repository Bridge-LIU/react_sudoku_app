import { describe, it, expect } from 'vitest';
import { getHighlights } from './selectors';
import { Board } from '@/types/domain';

const empty: Board = new Array(81).fill(0);

describe('getHighlights', () => {
  it('no selection -> empty', () => {
    const h = getHighlights(empty, null);
    expect(h.sameLine.size).toBe(0);
    expect(h.sameNumber.size).toBe(0);
  });
  it('sameLine has 20 peers', () => {
    const h = getHighlights(empty, 0);
    expect(h.sameLine.size).toBe(20);
  });
  it('sameNumber includes all cells with same value', () => {
    const b = [...empty] as any; b[0] = 3; b[10] = 3;
    const h = getHighlights(b as Board, 0);
    expect(h.sameNumber.has(10)).toBe(true);
  });
});
