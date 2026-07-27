/**
 * Mock puzzle fixture 生成。
 * ランタイムに engine の generator を呼んで PuzzleObject 形状にラップする。
 */

import { generatePuzzle } from '@/engine/generator';
import { Difficulty } from '@/types/domain';
import { PuzzleObject } from '@/mocks/schemas/puzzle';

let idCounter = 1;
function nextId(): string {
  return `puzzle_${String(idCounter++).padStart(6, '0')}`;
}

/**
 * ランタイム generator を使って新しい PuzzleObject を作る。
 * Mock handler が呼ばれるたびにこれを叩く。
 */
export function generateFixture(difficulty: Difficulty): PuzzleObject {
  const { puzzle, solution, clueCount } = generatePuzzle(difficulty);
  return {
    id: nextId(),
    difficulty,
    puzzle: [...puzzle],
    solution: [...solution],
    clueCount,
    isUnique: true,
    createdAt: new Date().toISOString(),
    generatorVersion: '1.0.0-mock',
  };
}
