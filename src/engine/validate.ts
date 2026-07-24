/**
 * Engine 入り口ガード関数。Mock / Azure / AI 由来のデータを信用せず、
 * 型と値域を実行時に検証する。TS の型は静的で、実行時の JS 値まで守れない。
 * ここで一度弾いておくと、solver / hintVerifier 内部で cast を安全に使える。
 */

import { Board, Digit, NonEmptyDigit, CellCoord } from '@/types/domain';

export class InvalidBoardError extends Error {}
export class InvalidHintError extends Error {}

export function isValidBoard(input: unknown): input is Board {
  if (!Array.isArray(input)) return false;
  if (input.length !== 81) return false;
  for (const v of input) {
    if (!Number.isInteger(v) || v < 0 || v > 9) return false;
  }
  return true;
}

export function assertValidBoard(input: unknown): asserts input is Board {
  if (!isValidBoard(input)) {
    throw new InvalidBoardError('board must be an array of 81 integers in 0..9');
  }
}

export interface RawHint {
  cell: CellCoord;
  number: number;
}

export function isValidHint(input: unknown): input is { cell: CellCoord; number: NonEmptyDigit } {
  if (!input || typeof input !== 'object') return false;
  const h = input as any;
  if (!h.cell || typeof h.cell !== 'object') return false;
  const { row, col } = h.cell;
  if (!Number.isInteger(row) || row < 0 || row > 8) return false;
  if (!Number.isInteger(col) || col < 0 || col > 8) return false;
  if (!Number.isInteger(h.number) || h.number < 1 || h.number > 9) return false;
  return true;
}

export function assertValidHint(input: unknown): asserts input is { cell: CellCoord; number: NonEmptyDigit } {
  if (!isValidHint(input)) {
    throw new InvalidHintError('hint must have integer cell.row/col in 0..8 and integer number in 1..9');
  }
}
