import { describe, it, expect } from 'vitest';
import { canonicalize, sha256 } from './figma-check.js';

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { c: 3, a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('handles nested objects', () => {
    const a = { x: { z: 1, y: 2 } };
    const b = { x: { y: 2, z: 1 } };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('sha256', () => {
  it('hashes empty string to known value', () => {
    expect(sha256('')).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "hello" to known value', () => {
    expect(sha256('hello')).toBe('sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('same input produces same hash', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
  });
});
