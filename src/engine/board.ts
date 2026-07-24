/**
 * 数独盘面工具。所有函数都是纯函数：只读入参、返回新结果，不修改任何外部状态。
 *
 * === 纯函数（pure function）快速科普 ===
 * 纯函数 = 相同输入永远返回相同输出 + 没有副作用（不修改外部变量、不打印、不写文件）。
 * 好处：
 *   - 好测试：不用 mock 任何东西，喂数据看返回值就行
 *   - 好复用：随便在哪调用都不会踩坑
 *   - 好并发：多线程/多协程调用同一个函数不会互相污染
 * 对比 Vue 里 `computed(() => state.count * 2)` —— computed 内部也是纯函数思路。
 *
 * === 索引约定 ===
 * 盘面用长度 81 的一维数组表示，index = row*9 + col
 *
 *   0  1  2 | 3  4  5 | 6  7  8       ← row 0
 *   9 10 11 |12 13 14 |15 16 17       ← row 1
 *  18 19 20 |21 22 23 |24 25 26       ← row 2
 *  --------+---------+---------
 *  27 ...                             ← row 3
 *  ...
 *  72 73 74 |75 76 77 |78 79 80       ← row 8
 *
 * "块"（block / box / 九宫格）是 3×3 的小方格，从左到右上到下编号 0..8：
 *
 *   块0 | 块1 | 块2
 *   ----+-----+----
 *   块3 | 块4 | 块5
 *   ----+-----+----
 *   块6 | 块7 | 块8
 *
 * "peers"（同伴）= 同行 8 + 同列 8 + 同块 4 - 去重后 = 20 个格子。
 * 数独规则可以简化成一句话：一个格子的值不能等于它任何 peer 的值。
 */

import { Board, Digit } from '@/types/domain';

// row = index 除以 9 取整。例：index=10 → row=1
export const rowOf = (idx: number): number => Math.floor(idx / 9);

// col = index 对 9 取余。例：index=10 → col=1
export const colOf = (idx: number): number => idx % 9;

// blockOf: 先把 row/col 各自压到 0/1/2 三段，再合成 0..8 的块号
// 例：idx=20 → row=2, col=2 → 块 (2/3)*3 + (2/3) = 0*3+0 = 0
// 例：idx=40 → row=4, col=4 → 块 (4/3)*3 + (4/3) = 1*3+1 = 4
export const blockOf = (idx: number): number =>
  Math.floor(rowOf(idx) / 3) * 3 + Math.floor(colOf(idx) / 3);

/**
 * peersOf: 返回某个 index 的所有 peer（同行/同列/同块，不含自己）。
 *
 * === 为什么用 Map 缓存？ ===
 * 每个 index 的 peer 集合是**常量**（不会变），但每次都跑 81 次循环去算太浪费。
 * 用 Map<index, Set<peer>> 存起来，第二次调用直接查表返回。
 * 类似 Vue 的 computed 缓存思路，但这里需要手动写。
 *
 * === Set 的用处（Vue 开发者可能用得少） ===
 * Set 是 JS 内置的"去重集合"，有 O(1) 的 has() 和 add()。
 * 这里返回 ReadonlySet 是给外部一个"只读视图"的类型保证——外部拿到不能改内容。
 */
const peersCache = new Map<number, ReadonlySet<number>>();
export function peersOf(idx: number): ReadonlySet<number> {
  const cached = peersCache.get(idx);
  if (cached) return cached;
  const r = rowOf(idx), c = colOf(idx), b = blockOf(idx);
  const set = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (i === idx) continue;
    if (rowOf(i) === r || colOf(i) === c || blockOf(i) === b) set.add(i);
  }
  peersCache.set(idx, set);
  return set;
}

/**
 * isValidPlacement: 判断把 val 放到 idx 是否合法（不与任何 peer 冲突）。
 * val = 0（空）总是合法——因为"清空一个格子"永远没问题。
 *
 * 注意：这个函数**不修改 board**，只是"预演一下"。真正落子由调用方决定。
 */
export function isValidPlacement(board: Board, idx: number, val: Digit): boolean {
  if (val === 0) return true;
  for (const p of peersOf(idx)) {
    if (board[p] === val) return false;
  }
  return true;
}

/**
 * findConflicts: 找出当前盘面所有处于冲突状态的格子 index。
 * 用于 UI 高亮"哪些格子有错"——比如玩家填了两个相同的 5 在同一行，两个都标红。
 *
 * 注意冲突是**双向**的：如果 [i, p] 冲突，则 i 和 p 都要标出来。
 */
export function findConflicts(board: Board): ReadonlySet<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const v = board[i];
    if (v === 0) continue;
    for (const p of peersOf(i)) {
      if (board[p] === v) { bad.add(i); bad.add(p); }
    }
  }
  return bad;
}
