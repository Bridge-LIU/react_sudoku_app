import { describe, it, expect } from 'vitest';
import { isValidBoard, isValidHint, assertValidBoard, assertValidHint, InvalidBoardError, InvalidHintError } from './validate';

describe('isValidBoard', () => {
  it('accepts a valid 81-length board of 0-9', () => {
    expect(isValidBoard(new Array(81).fill(0))).toBe(true);
    expect(isValidBoard([1,2,3,4,5,6,7,8,9, ...new Array(72).fill(0)])).toBe(true);
  });
  it('rejects non-array', () => {
    expect(isValidBoard(null)).toBe(false);
    expect(isValidBoard('nope' as any)).toBe(false);
    expect(isValidBoard({ length: 81 } as any)).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidBoard(new Array(80).fill(0))).toBe(false);
    expect(isValidBoard(new Array(82).fill(0))).toBe(false);
  });
  it('rejects out-of-range values', () => {
    const b = new Array(81).fill(0); b[0] = 10;
    expect(isValidBoard(b)).toBe(false);
    b[0] = -1;
    expect(isValidBoard(b)).toBe(false);
    b[0] = 0.5;
    expect(isValidBoard(b)).toBe(false);
    b[0] = NaN;
    expect(isValidBoard(b)).toBe(false);
  });
  it('assertValidBoard throws InvalidBoardError', () => {
    expect(() => assertValidBoard(null)).toThrow(InvalidBoardError);
  });
});

describe('isValidHint', () => {
  it('accepts valid hint', () => {
    expect(isValidHint({ cell: { row: 0, col: 0 }, number: 5 })).toBe(true);
    expect(isValidHint({ cell: { row: 8, col: 8 }, number: 9 })).toBe(true);
  });
  it('rejects row/col out of bounds', () => {
    expect(isValidHint({ cell: { row: -1, col: 0 }, number: 5 })).toBe(false);
    expect(isValidHint({ cell: { row: 9, col: 0 }, number: 5 })).toBe(false);
    expect(isValidHint({ cell: { row: 0, col: 9 }, number: 5 })).toBe(false);
  });
  it('rejects non-integer row/col', () => {
    expect(isValidHint({ cell: { row: 0.5, col: 0 }, number: 5 })).toBe(false);
    expect(isValidHint({ cell: { row: NaN, col: 0 }, number: 5 })).toBe(false);
  });
  it('rejects number out of 1-9', () => {
    expect(isValidHint({ cell: { row: 0, col: 0 }, number: 0 })).toBe(false);
    expect(isValidHint({ cell: { row: 0, col: 0 }, number: 10 })).toBe(false);
    expect(isValidHint({ cell: { row: 0, col: 0 }, number: 0.5 })).toBe(false);
  });
  it('rejects missing structure', () => {
    expect(isValidHint(null)).toBe(false);
    expect(isValidHint({} as any)).toBe(false);
    expect(isValidHint({ cell: {}, number: 5 } as any)).toBe(false);
  });
  it('assertValidHint throws InvalidHintError', () => {
    expect(() => assertValidHint({} as any)).toThrow(InvalidHintError);
  });
});
