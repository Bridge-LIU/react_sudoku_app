/**
 * hintVerifier: 校验 AI 返回的 hint 是否合法。
 *
 * === 为什么需要这一层？ ===
 * BAF 信用原则：AI 是伙伴不是道具，AI 说的话不能盲信。
 * 我们的 Mock 层甚至会**故意 10% 返回错误 hint**（Task 7 会写），
 * 就是要确保 verify 分支真的会被执行、能拦截。
 * 未来接真 Azure OpenAI 时，模型偶尔幻觉也会被这一关挡住。
 *
 * === Discriminated Union 类型 ===
 * HintVerdict 是 { ok: true } | { ok: false; reason: '...' }。
 * TS 会根据 verdict.ok 自动缩窄类型：
 *   if (verdict.ok) { ... }  ← 这里 TS 知道没有 reason 字段
 *   else { verdict.reason }  ← 这里 TS 知道一定有 reason
 * 比返回 null 或抛异常都优雅、类型安全。
 */
import { Board, Digit, NonEmptyDigit, CellCoord } from '@/types/domain';
import { isValidPlacement } from './board';

export type HintVerdict =
  | { ok: true }
  | { ok: false; reason: 'INITIAL_CELL' | 'CONFLICT' | 'ALREADY_FILLED' | 'NOT_IN_SOLUTION' };

export function verifyHint(
  puzzle: Board,
  current: Board,
  solution: Board,
  hint: { cell: CellCoord; number: NonEmptyDigit | Digit }
): HintVerdict {
  const idx = hint.cell.row * 9 + hint.cell.col;
  // 出界视作 CONFLICT
  if (idx < 0 || idx >= 81) return { ok: false, reason: 'CONFLICT' };
  // 初始格：出题时就给的数字，AI 不能"提示"这些
  if (puzzle[idx] !== 0) return { ok: false, reason: 'INITIAL_CELL' };
  // 玩家已经自己填了：AI 别来添乱
  if (current[idx] !== 0) return { ok: false, reason: 'ALREADY_FILLED' };
  // AI 说的数字对不上正解：AI 错了
  if (solution[idx] !== hint.number) return { ok: false, reason: 'NOT_IN_SOLUTION' };
  // 最后一道保险：即使跟正解匹配，也检查一下当前盘面下这个放置是否合法
  if (!isValidPlacement(current, idx, hint.number as Digit)) return { ok: false, reason: 'CONFLICT' };
  return { ok: true };
}
