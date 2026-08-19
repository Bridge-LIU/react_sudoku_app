import { describe, it, expect } from 'vitest';
import { canonicalize, hashNode } from '../scripts/lib/canonicalize.js';

describe('canonicalize', () => {
  it('produces stable string regardless of key order', () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('hashes identical nodes to same value', () => {
    const n1 = { id: 'x', name: 'A', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
    const n2 = { id: 'x', name: 'A', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
    expect(hashNode(n1, ['name', 'fills'])).toBe(hashNode(n2, ['name', 'fills']));
  });

  it('hashes different nodes differently', () => {
    const n1 = { id: 'x', fills: [{ color: { r: 1, g: 0, b: 0 } }] };
    const n2 = { id: 'x', fills: [{ color: { r: 0, g: 1, b: 0 } }] };
    expect(hashNode(n1, ['fills'])).not.toBe(hashNode(n2, ['fills']));
  });
});
