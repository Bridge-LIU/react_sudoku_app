/**
 * 唯一解判定：调用 solver 找最多 2 个解，恰好 1 个即为唯一。
 *
 * 为什么不算所有解？空盘有几百万个解，全算完要很久。
 * 我们只关心"唯一性"这个布尔值，所以 solver 找到 2 个立刻停即可。
 */
import { Board } from '@/types/domain';
import { solve } from './solver';

export function hasUniqueSolution(board: Board): boolean {
  return solve(board, { maxSolutions: 2 }).length === 1;
}
