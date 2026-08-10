import { describe, it, expect } from 'vitest';
import { verifyHint } from './hintVerifier';
import { Board, Digit } from '@/types/domain';

const empty = new Array(81).fill(0) as Board;

describe('verifyHint', () => {
  it('rejects INITIAL_CELL', () => {
    const puzzle = [...empty] as Digit[]; puzzle[0] = 5;
    const r = verifyHint(puzzle as Board, puzzle as Board, puzzle as Board, { cell: { row: 0, col: 0 }, number: 6 });
    expect(r).toEqual({ ok: false, reason: 'INITIAL_CELL' });
  });
  it('rejects ALREADY_FILLED', () => {
    const puzzle = [...empty] as Digit[];
    const current = [...empty] as Digit[]; current[0] = 7;
    const r = verifyHint(puzzle as Board, current as Board, empty, { cell: { row: 0, col: 0 }, number: 8 });
    expect(r).toEqual({ ok: false, reason: 'ALREADY_FILLED' });
  });
  it('rejects NOT_IN_SOLUTION', () => {
    const sol = [...empty] as Digit[]; sol[0] = 3;
    const r = verifyHint(empty, empty, sol as Board, { cell: { row: 0, col: 0 }, number: 5 });
    expect(r).toEqual({ ok: false, reason: 'NOT_IN_SOLUTION' });
  });
  it('rejects CONFLICT', () => {
    const current = [...empty] as Digit[]; current[1] = 4;
    const sol = [...empty] as Digit[]; sol[0] = 4;
    const r = verifyHint(empty, current as Board, sol as Board, { cell: { row: 0, col: 0 }, number: 4 });
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' });
  });
  it('accepts a valid hint', () => {
    const sol = [...empty] as Digit[]; sol[0] = 4;
    const r = verifyHint(empty, empty, sol as Board, { cell: { row: 0, col: 0 }, number: 4 });
    expect(r).toEqual({ ok: true });
  });
  it('rejects out-of-bounds cell', () => {
    const sol = [...empty] as Digit[]; sol[0] = 4;
    const r = verifyHint(empty, empty, sol as Board, { cell: { row: 9, col: 0 }, number: 4 as any });
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' });
  });
  it('rejects malformed hint (NaN)', () => {
    const sol = [...empty] as Digit[]; sol[0] = 4;
    const r = verifyHint(empty, empty, sol as Board, { cell: { row: NaN as any, col: 0 }, number: 4 as any });
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' });
  });
  it('rejects malformed hint (number 0)', () => {
    const sol = [...empty] as Digit[]; sol[0] = 4;
    const r = verifyHint(empty, empty, sol as Board, { cell: { row: 0, col: 0 }, number: 0 as any });
    expect(r).toEqual({ ok: false, reason: 'CONFLICT' });
  });

  describe('correction mode', () => {
    it('accepts correction on a wrong-filled cell', () => {
      // puzzle は空、current にユーザーの誤り (5)、solution は 4
      const current = [...empty] as Digit[]; current[0] = 5;
      const sol = [...empty] as Digit[]; sol[0] = 4;
      const r = verifyHint(empty, current as Board, sol as Board,
        { cell: { row: 0, col: 0 }, number: 4 }, 'correction');
      expect(r).toEqual({ ok: true });
    });

    it('correction: rejects INITIAL_CELL (初期セルは訂正不可)', () => {
      const puzzle = [...empty] as Digit[]; puzzle[0] = 5;
      const r = verifyHint(puzzle as Board, puzzle as Board, puzzle as Board,
        { cell: { row: 0, col: 0 }, number: 6 }, 'correction');
      expect(r).toEqual({ ok: false, reason: 'INITIAL_CELL' });
    });

    it('correction: rejects NOT_IN_SOLUTION', () => {
      const current = [...empty] as Digit[]; current[0] = 5;
      const sol = [...empty] as Digit[]; sol[0] = 3;
      const r = verifyHint(empty, current as Board, sol as Board,
        { cell: { row: 0, col: 0 }, number: 4 }, 'correction');
      expect(r).toEqual({ ok: false, reason: 'NOT_IN_SOLUTION' });
    });

    it('correction: peer に自分の古い値があっても OK (clear してから判定)', () => {
      // 同じ行の cell 1 に 5 が既に存在 → 通常 fill モードなら cell 0 に 5 は CONFLICT
      // correction モードでは cell 0 を clear した状態で判定するので OK にはならない
      // (cell 1 の 5 は別セルなので、cell 0 に 5 を置いたら衝突)
      const current = [...empty] as Digit[]; current[0] = 4; current[1] = 5;
      const sol = [...empty] as Digit[]; sol[0] = 5;
      const r = verifyHint(empty, current as Board, sol as Board,
        { cell: { row: 0, col: 0 }, number: 5 }, 'correction');
      // solution が 5 でも、peer に 5 があるので CONFLICT
      expect(r).toEqual({ ok: false, reason: 'CONFLICT' });
    });

    it('correction: 上書き対象セル自身の古い値は衝突扱いしない', () => {
      // current[0]=5 (誤り); その他のセルには 4 が無い; solution[0]=4
      // fill モードなら ALREADY_FILLED で拒否されるが、correction モードでは通す
      const current = [...empty] as Digit[]; current[0] = 5;
      const sol = [...empty] as Digit[]; sol[0] = 4;
      const r = verifyHint(empty, current as Board, sol as Board,
        { cell: { row: 0, col: 0 }, number: 4 }, 'correction');
      expect(r).toEqual({ ok: true });
    });
  });
});
