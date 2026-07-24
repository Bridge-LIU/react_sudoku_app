/**
 * 数独求解器：回溯（backtracking）+ MRV 启发式（heuristic）。
 *
 * =====================================================
 * === 回溯思路（backtracking）：递归 + 撤销 ==========
 * =====================================================
 * 想象你在走迷宫，走到岔路口选一条路，走不通就退回来选另一条。
 * 数独求解就是这个思路：
 *
 *   1. 找一个空格
 *   2. 试着填 1..9 里合法的候选数
 *   3. 每填一个数字，递归解剩下的空格
 *   4. 如果发现"这一步之后再也解不出来"，就撤销刚才那一步，试下一个候选
 *   5. 所有格子都填满 → 找到一个解
 *
 * ASCII 例子（简化，5 是刚试着填的）：
 *
 *   . 3 . |            5 3 . |            5 3 . |
 *   . . . |  →  试 5   . . . |  →  递归   . . . |  →  发现下一步没候选
 *   . . . |            . . . |            . . . |     → 撤销回到试 6
 *
 * 关键：**每次递归返回前一定要把 board[idx] 改回 0**，不然回溯上层看到的就是脏数据。
 *
 * =====================================================
 * === MRV（Most Restricted Variable）启发式 ==========
 * =====================================================
 * "选下一个要填的空格"时，选**候选最少**的那个。
 *
 * 例如：
 *   格 A 只有候选 {5}      ← 只能填 5，先填！错了立刻回溯
 *   格 B 有候选 {1,3,5,7}  ← 4 个选择，先填的话要试 4 次才知道错
 *
 * 直觉：从"死角"（约束最紧的地方）开始搜，能最快剪枝。
 * 对比"从左上到右下扫"的朴素版本，MRV 在 hard 题上能提速 10-100 倍。
 *
 * =====================================================
 * === 为什么用 maxSolutions（找到 N 个就停）？========
 * =====================================================
 * 判断数独是否"唯一解"时，只需要证明"至少 2 个解"或"只有 1 个解"，
 * 不用真的把所有解算出来。设 maxSolutions=2，找到 2 个就停，节省大量时间。
 * 出题（generator）时会用这个函数验证"这个题目是唯一解吗？"。
 *
 * =====================================================
 * === 纯函数保证 =======================================
 * =====================================================
 * 外部传入的 board 是 readonly，函数内部**先复制一份可变副本**再回溯。
 * 原 board 完全不被修改——调用方可以放心地把它继续用在别处。
 * 这就是 "immutable in, immutable out" 的思路。
 */

import { Board, Digit, NonEmptyDigit } from '@/types/domain';
import { peersOf, findConflicts } from './board';
import { isValidBoard } from './validate';

export interface SolveOptions {
  readonly maxSolutions?: number;    // 默认 1
}

export function solve(input: Board, opts: SolveOptions = {}): Board[] {
  const max = opts.maxSolutions ?? 1;

  // === 事前チェック：入力が不正なら即 [] を返す ===
  // まず型・値域チェック：Mock/AI/Azure 由来の不正データを弾く（信用境界の一次防御）。
  if (!isValidBoard(input)) return [];
  // 例：row 0 に 1 が 2 個ある盤面。findEmpty は 0 でない cell を触らないので、
  // このコンフリクトは backtrack 中に検出されず、無効な "解" を返してしまう。
  // それどころか、探索空間が爆発してハングする。
  // ここで最初に findConflicts で弾く。
  if (findConflicts(input).size > 0) return [];

  // === readonly 数组的复制小技巧 ===
  // input 类型是 readonly Digit[]，不能直接 push/改元素。
  // 用 spread [...input] 复制成新的 mutable 数组，再断言成 Digit[] 就能改了。
  // 这份 board 只在函数内部生存，外面看不到——所以"外部不可变、内部可变"是安全的。
  const board = [...input] as Digit[];
  const solutions: Board[] = [];

  /**
   * 算某个空格的合法候选（1..9 中不在 peers 里的数字）。
   * 用 Set 存已用数字，has() 是 O(1)。
   */
  function candidates(idx: number): NonEmptyDigit[] {
    const used = new Set<Digit>();
    // p は 0..80、board は length 81 なので必ず定義済み
    for (const p of peersOf(idx)) used.add(board[p]!);
    const out: NonEmptyDigit[] = [];
    for (let d = 1; d <= 9; d++) {
      if (!used.has(d as Digit)) out.push(d as NonEmptyDigit);
    }
    return out;
  }

  /**
   * MRV：扫一遍所有空格，找候选数最少的那个。
   * 返回 -1 表示"没有空格了"（=盘面已填满）。
   *
   * 小优化：只要发现某格候选 <= 1，直接返回它——因为不可能比它更少了。
   */
  function findEmpty(): number {
    let best = -1;
    let bestCount = 10; // 初始设 10，任何真实候选数（0..9）都会更小
    for (let i = 0; i < 81; i++) {
      if (board[i] !== 0) continue;
      const c = candidates(i).length;
      if (c < bestCount) {
        bestCount = c;
        best = i;
        if (c <= 1) return i;
      }
    }
    return best;
  }

  /**
   * 主回溯函数。
   * 返回 true = "找齐 maxSolutions 个解了，可以一路 return 结束"。
   * 返回 false = "这条路失败了，请调用者继续试下一个候选"。
   */
  function backtrack(): boolean {
    if (solutions.length >= max) return true;
    const idx = findEmpty();
    if (idx === -1) {
      // 没空格了 = 是个完整解，收集一份快照（再次复制一次防止后续被改）
      solutions.push([...board] as Board);
      return solutions.length >= max;
    }
    for (const d of candidates(idx)) {
      board[idx] = d;
      if (backtrack()) return true;
      board[idx] = 0; // 撤销 = 回溯核心动作
    }
    return false;
  }

  backtrack();
  return solutions;
}
