import { describe, it, expect } from 'vitest';
import { rowOf, colOf, blockOf, peersOf, isValidPlacement, findConflicts } from './board';
import { Board } from '@/types/domain';

describe('board index utils', () => {
  it('rowOf', () => { expect(rowOf(0)).toBe(0); expect(rowOf(9)).toBe(1); expect(rowOf(80)).toBe(8); });
  it('colOf', () => { expect(colOf(0)).toBe(0); expect(colOf(8)).toBe(8); expect(colOf(9)).toBe(0); });
  it('blockOf', () => { expect(blockOf(0)).toBe(0); expect(blockOf(4)).toBe(1); expect(blockOf(80)).toBe(8); });
  it('peersOf size = 20', () => { expect(peersOf(0).size).toBe(20); expect(peersOf(40).size).toBe(20); });
});

describe('isValidPlacement', () => {
  const empty: Board = new Array(81).fill(0);
  it('empty board any placement is valid', () => {
    expect(isValidPlacement(empty, 0, 5)).toBe(true);
  });
  it('detects row conflict', () => {
    const b = [...empty] as any; b[0] = 5;
    expect(isValidPlacement(b as Board, 8, 5)).toBe(false);
  });
  it('detects column conflict', () => {
    const b = [...empty] as any; b[0] = 5;
    expect(isValidPlacement(b as Board, 72, 5)).toBe(false);
  });
  it('detects block conflict', () => {
    const b = [...empty] as any; b[0] = 5;
    expect(isValidPlacement(b as Board, 20, 5)).toBe(false);
  });
});

describe('findConflicts', () => {
  const empty: Board = new Array(81).fill(0);
  it('returns empty set for valid board', () => {
    expect(findConflicts(empty).size).toBe(0);
  });
  it('returns both indices when two same in row', () => {
    const b = [...empty] as any; b[0] = 5; b[1] = 5;
    const conf = findConflicts(b as Board);
    expect(conf.has(0)).toBe(true); expect(conf.has(1)).toBe(true);
  });
});
