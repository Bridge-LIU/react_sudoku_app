import { describe, it, expect } from 'vitest';
import { solve } from './solver';
import { Board } from '@/types/domain';

function boardFromString(s: string): Board {
  return s.replace(/\s/g, '').split('').map(c => (c === '.' ? 0 : parseInt(c, 10))) as Board;
}

// 经典 Norvig 例题，已知唯一解
const KNOWN_UNIQUE = boardFromString(
  '53..7.... 6..195... .98....6. 8...6...3 4..8.3..1 7...2...6 .6....28. ...419..5 ....8..79'
);

describe('solver.solve', () => {
  it('returns 1 solution for a known unique puzzle', () => {
    const sols = solve(KNOWN_UNIQUE, { maxSolutions: 2 });
    expect(sols.length).toBe(1);
    expect(sols[0].every(v => v >= 1 && v <= 9)).toBe(true);
  });

  it('returns 0 solutions for unsolvable puzzle', () => {
    const bad = new Array(81).fill(0) as any;
    bad[0] = 1; bad[1] = 1; // 第一行两个 1，无解
    expect(solve(bad, { maxSolutions: 2 }).length).toBe(0);
  });

  it('stops at maxSolutions for empty board', () => {
    const empty: Board = new Array(81).fill(0);
    const sols = solve(empty, { maxSolutions: 2 });
    // 空盘有几百万个解，但设置 maxSolutions=2 后应该 2 个就停
    expect(sols.length).toBe(2);
  });
});
