/**
 * 难度判定 v1：按 clue（初始提示格）数分档。
 * 未来 v2 可加入"要用到什么解法（naked pair / X-wing 等）"来判难度。
 */
import { Difficulty } from '@/types/domain';

export const CLUE_RANGES = {
  easy:   { min: 36, max: 45 },
  medium: { min: 30, max: 35 },
  hard:   { min: 24, max: 29 },
} as const;

export function classifyByClueCount(n: number): Difficulty {
  // 不正入力ガード：NaN / 小数 / 範囲外は即エラー。
  // silent に 'hard' 扱いすると呼び出し側のバグに気づけないので throw する。
  if (!Number.isInteger(n) || n < 0 || n > 81) {
    throw new Error(`classifyByClueCount: invalid clueCount ${n}`);
  }
  if (n >= CLUE_RANGES.easy.min) return 'easy';
  if (n >= CLUE_RANGES.medium.min) return 'medium';
  return 'hard';
}
