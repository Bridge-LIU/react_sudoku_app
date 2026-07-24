// 数独领域的核心类型。所有模块共享这些定义。
// Digit 用 union 0-9 而不是 number，让 TS 帮我们防止把 15 写进盘面。

export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type NonEmptyDigit = Exclude<Digit, 0>;

// 盘面用长度 81 的数组表示，index = row*9 + col。
// readonly 是 TS 的不可变标记（类似 Vue 的 readonly()），迫使我们用函数式方式更新。
export type Board = readonly Digit[];

export type Difficulty = 'easy' | 'medium' | 'hard';
export type HintLevel = 'weak' | 'medium' | 'strong';

// 候选 memo：Cell index -> 备选数字列表
export interface Notes {
  readonly [cellIndex: number]: readonly NonEmptyDigit[];
}

export interface CellCoord {
  readonly row: number;
  readonly col: number;
}
