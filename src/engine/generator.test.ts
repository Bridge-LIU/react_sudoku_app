import { describe, it, expect } from 'vitest';
import { generateCompleteBoard, generatePuzzle } from './generator';
import { findConflicts } from './board';
import { hasUniqueSolution } from './uniqueness';

// 可复现的伪随机数生成器（Mulberry32）—— 相同 seed 永远输出相同序列
function mulberry32(seed: number) {
  let a = seed;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateCompleteBoard', () => {
  it('produces a valid complete board', () => {
    const b = generateCompleteBoard(mulberry32(42));
    expect(b.length).toBe(81);
    expect(b.every(v => v >= 1 && v <= 9)).toBe(true);
    expect(findConflicts(b).size).toBe(0);
  });
});

describe('generatePuzzle', () => {
  it('easy puzzle has unique solution and 36-45 clues', () => {
    const { puzzle, solution, clueCount } = generatePuzzle('easy', mulberry32(1));
    expect(hasUniqueSolution(puzzle)).toBe(true);
    expect(clueCount).toBeGreaterThanOrEqual(36);
    expect(clueCount).toBeLessThanOrEqual(45);
    expect(solution.length).toBe(81);
  }, 30000);

  it('medium puzzle 30-35 clues', () => {
    const { clueCount } = generatePuzzle('medium', mulberry32(2));
    expect(clueCount).toBeGreaterThanOrEqual(30);
    expect(clueCount).toBeLessThanOrEqual(35);
  }, 60000);
});
