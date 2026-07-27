/**
 * State から派生する読み取り専用データ計算。
 * 対比：Vue の computed() ／ Pinia の getters。
 * ここでは pure 関数として書く（memoization は使わない — 十分速い）。
 */
import { Board } from '@/types/domain';
import { peersOf } from '@/engine/board';

export function getHighlights(
  board: Board,
  selected: number | null
): { sameLine: ReadonlySet<number>; sameNumber: ReadonlySet<number> } {
  if (selected === null) return { sameLine: new Set(), sameNumber: new Set() };
  const sameLine = new Set<number>(peersOf(selected));
  const val = board[selected];
  const sameNumber = new Set<number>();
  // noUncheckedIndexedAccess: val は Digit | undefined。undefined は範囲外（想定外だが防御的に扱う）
  if (val !== undefined && val !== 0) {
    for (let i = 0; i < 81; i++) if (board[i] === val) sameNumber.add(i);
  }
  return { sameLine, sameNumber };
}
