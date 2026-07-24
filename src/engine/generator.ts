/**
 * 数独出题（generator）。分两步：
 *
 * 1. generateCompleteBoard: 回溯生成一个满盘（81 格全填）
 * 2. generatePuzzle: 从满盘挖洞——随机选格、擦掉、检查剩下的题是否唯一解、
 *    是就继续挖、不是就放回。直到达到目标 clue 数。
 *
 * === 为什么要"挖洞"而不是"直接生成题目"？ ===
 * 直接生成题目可能出多解或无解。挖洞法保证：
 *   - 满盘一定有解（本身就是一个解）
 *   - 每挖一格都验证"剩下还唯一解吗"，保证最终题目是唯一解
 *
 * === RNG 注入的意义 ===
 * 函数接受可选的 RNG（伪随机数生成器）。测试时传固定 seed 的 RNG，
 * 生成过程完全可复现——你能对着 seed 复现 bug、写确定性测试。
 * 生产时用默认的 Math.random。
 * 这是"依赖注入"思想的最小案例。
 */

import { Board, Digit, Difficulty, NonEmptyDigit } from '@/types/domain';
import { peersOf } from './board';
import { hasUniqueSolution } from './uniqueness';

export type RNG = () => number;
const defaultRng: RNG = Math.random;

// Fisher-Yates 洗牌，纯函数版
function shuffle<T>(arr: readonly T[], rng: RNG): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 用回溯生成一个完整盘面。跟 solver 差别：
 *   - solver 尝试候选顺序是 1..9（固定）
 *   - generator 每次把候选**打乱顺序**再试，才能生成多样化的盘
 */
export function generateCompleteBoard(rng: RNG = defaultRng): Board {
  const board = new Array(81).fill(0) as Digit[];
  function fill(idx: number): boolean {
    if (idx === 81) return true;
    if (board[idx] !== 0) return fill(idx + 1);
    const digits = shuffle([1,2,3,4,5,6,7,8,9], rng) as NonEmptyDigit[];
    const used = new Set<Digit>();
    for (const p of peersOf(idx)) used.add(board[p]);
    for (const d of digits) {
      if (used.has(d as Digit)) continue;
      board[idx] = d;
      if (fill(idx + 1)) return true;
      board[idx] = 0;
    }
    return false;
  }
  fill(0);
  return board as Board;
}

// 每难度的目标 clue 数（提示格数）
const CLUE_TARGET: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 };

/**
 * 从满盘挖洞成题目。
 * 循环挖：随机选一格 → 擦掉 → 若剩下依然唯一解则接受、否则还原 → 直到达到目标 clue 数。
 *
 * ⚠️ 注意：clue が target まで削れないこともある（唯一解制約に阻まれた場合）。
 * 呼び出し側は clueCount を必ず確認すること。difficulty 判定は clueCount 実際値ベース。
 */
export function generatePuzzle(
  difficulty: Difficulty,
  rng: RNG = defaultRng
): { puzzle: Board; solution: Board; clueCount: number } {
  const solution = generateCompleteBoard(rng);
  const puzzle = [...solution] as Digit[];
  const target = CLUE_TARGET[difficulty];
  const indices = shuffle([...Array(81).keys()], rng);
  let clues = 81;
  for (const i of indices) {
    if (clues <= target) break;
    const saved = puzzle[i];
    puzzle[i] = 0;
    if (hasUniqueSolution(puzzle as Board)) {
      clues--;
    } else {
      puzzle[i] = saved; // 挖了会破坏唯一性，放回去
    }
  }
  return { puzzle: puzzle as Board, solution, clueCount: clues };
}
