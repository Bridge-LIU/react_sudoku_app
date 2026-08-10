import { describe, it, expect } from 'vitest';
import { canonicalize, sha256, findNode, computePerFrameHash, computeMetaHash, diffHashes } from './figma-check.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, '__fixtures__', name), 'utf8'));

const v1 = loadFixture('figma-response-v1.json');
const v2 = loadFixture('figma-response-v2-modified.json');
const v3 = loadFixture('figma-response-v3-added.json');
const v4 = loadFixture('figma-response-v4-removed.json');

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

describe('findNode', () => {
  it('finds top-level page by id', () => {
    const node = findNode(v1.document, '0:1');
    expect(node).toBeTruthy();
    expect(node.name).toBe('JP');
  });

  it('finds nested frame by id', () => {
    const node = findNode(v1.document, '0:2');
    expect(node).toBeTruthy();
    expect(node.name).toBe('Board');
  });

  it('returns null for missing id', () => {
    expect(findNode(v1.document, '999:999')).toBeNull();
  });
});

describe('computePerFrameHash', () => {
  it('produces one entry per registered id that exists', () => {
    const hash = computePerFrameHash(v1.document, ['0:1', '6:6', '6:410']);
    expect(Object.keys(hash).sort()).toEqual(['0:1', '6:410', '6:6']);
    expect(hash['0:1']).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('omits ids that do not exist in tree', () => {
    const hash = computePerFrameHash(v1.document, ['0:1', 'nonexistent:999']);
    expect(Object.keys(hash)).toEqual(['0:1']);
  });

  it('is deterministic (same tree, same hashes)', () => {
    const a = computePerFrameHash(v1.document, ['0:1', '6:6']);
    const b = computePerFrameHash(v1.document, ['0:1', '6:6']);
    expect(a).toEqual(b);
  });

  it('v1 and v2 differ on 6:6 hash only', () => {
    const a = computePerFrameHash(v1.document, ['0:1', '6:6', '6:410']);
    const b = computePerFrameHash(v2.document, ['0:1', '6:6', '6:410']);
    expect(a['0:1']).toBe(b['0:1']);
    expect(a['6:6']).not.toBe(b['6:6']);
    expect(a['6:410']).toBe(b['6:410']);
  });
});

describe('computeMetaHash', () => {
  it('produces same hash for same meta', () => {
    expect(computeMetaHash(v1)).toBe(computeMetaHash(v1));
  });

  it('handles missing meta fields (all empty)', () => {
    const empty = { document: {} };
    const withEmptyMeta = { document: {}, styles: {}, components: {}, componentSets: {} };
    expect(computeMetaHash(empty)).toBe(computeMetaHash(withEmptyMeta));
  });

  it('detects style change', () => {
    const a = { styles: { 'S:1': { name: 'primary', color: 'red' } }, components: {}, componentSets: {} };
    const b = { styles: { 'S:1': { name: 'primary', color: 'blue' } }, components: {}, componentSets: {} };
    expect(computeMetaHash(a)).not.toBe(computeMetaHash(b));
  });

  it('v1 fixtures have empty meta, hash is stable', () => {
    const h = computeMetaHash(v1);
    expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe('diffHashes', () => {
  it('test_no_change: identical hashes → all empty', () => {
    const prev = { '0:1': 'a', '6:6': 'b' };
    const curr = { '0:1': 'a', '6:6': 'b' };
    expect(diffHashes(prev, curr)).toEqual({ changed: [], added: [], removed: [] });
  });

  it('test_frame_modified: one hash differs → changed', () => {
    const prev = { '0:1': 'a', '6:6': 'b' };
    const curr = { '0:1': 'a', '6:6': 'B_MODIFIED' };
    expect(diffHashes(prev, curr)).toEqual({ changed: ['6:6'], added: [], removed: [] });
  });

  it('test_frame_added: new key → added', () => {
    const prev = { '0:1': 'a' };
    const curr = { '0:1': 'a', '9:999': 'new' };
    expect(diffHashes(prev, curr)).toEqual({ changed: [], added: ['9:999'], removed: [] });
  });

  it('test_frame_removed: missing key → removed', () => {
    const prev = { '0:1': 'a', '6:6': 'b' };
    const curr = { '0:1': 'a' };
    expect(diffHashes(prev, curr)).toEqual({ changed: [], added: [], removed: ['6:6'] });
  });

  it('handles null prev (first run, treat all as added)', () => {
    const curr = { '0:1': 'a', '6:6': 'b' };
    expect(diffHashes(null, curr)).toEqual({ changed: [], added: ['0:1', '6:6'], removed: [] });
  });

  it('handles all three simultaneously', () => {
    const prev = { '0:1': 'a', '6:6': 'b', '6:410': 'c' };
    const curr = { '0:1': 'a', '6:6': 'B_MOD', '9:999': 'd' };
    const result = diffHashes(prev, curr);
    expect(result.changed).toEqual(['6:6']);
    expect(result.added).toEqual(['9:999']);
    expect(result.removed).toEqual(['6:410']);
  });
});
