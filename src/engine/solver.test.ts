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
    expect(sols[0]!.every(v => v >= 1 && v <= 9)).toBe(true);
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

  it('backtracks correctly on mid-search dead end', () => {
    // 一見矛盾なし、でも埋めていくうちに必ず矛盾に到達する盤面
    // Row 0 に 7 個の 1..7 → 残り 2 マス埋めるには {8,9}
    // Column 7 と 8 それぞれ既に 8 と 9 を持たせて矛盾を作る
    const b = new Array(81).fill(0) as any;
    // Row 0: [1,2,3,4,5,6,7,_,_]
    for (let i = 0; i < 7; i++) b[i] = i + 1;
    // Col 7 row 3 に 8 → row 0 col 7 に 8 不可
    b[3 * 9 + 7] = 8;
    b[3 * 9 + 8] = 9;
    b[4 * 9 + 7] = 9;
    b[4 * 9 + 8] = 8;
    // 有効な initial だが row 0 の残り 2 マスを {8,9} で埋めようとすると必ず col 7/8 と衝突
    const sols = solve(b as Board, { maxSolutions: 1 });
    expect(sols.length).toBe(0);
  });

  it('rejects invalid input board', () => {
    // 不正入力（配列でない / 長さ違い / 値域外）は空配列で返る
    expect(solve(null as any).length).toBe(0);
    expect(solve(new Array(80).fill(0) as any).length).toBe(0);
    const bad = new Array(81).fill(0) as any; bad[0] = 10;
    expect(solve(bad).length).toBe(0);
  });
});
