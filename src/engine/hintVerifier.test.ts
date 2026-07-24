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
});
