import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { canonicalize, sha256, findNode, extractTextNodes, extractTextSnapshot, diffTextSnapshots, computePerFrameHash, computeMetaHash, diffHashes, assertFigmaResponse, assertHashStability, assertDiffDisjoint, StateSchema, ConfigSchema, runCheck } from './figma-check.js';
import { readFileSync } from 'node:fs';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

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

describe('extractTextNodes', () => {
  it('returns empty object for node with no TEXT children', () => {
    const node = { id: '0:1', type: 'CANVAS', children: [{ id: '0:2', type: 'FRAME' }] };
    expect(extractTextNodes(node)).toEqual({});
  });

  it('extracts TEXT node with characters field', () => {
    const node = {
      id: '0:1', type: 'CANVAS',
      children: [{ id: '0:2', type: 'TEXT', characters: 'Hello' }],
    };
    expect(extractTextNodes(node)).toEqual({
      '0:2': { text: 'Hello' },
    });
  });

  it('extracts TEXT nodes at deeper nesting', () => {
    const node = {
      id: '0:1', type: 'CANVAS',
      children: [
        {
          id: '0:2', type: 'FRAME',
          children: [
            { id: '0:3', type: 'TEXT', characters: 'A' },
            { id: '0:4', type: 'FRAME', children: [{ id: '0:5', type: 'TEXT', characters: 'B' }] },
          ],
        },
      ],
    };
    expect(extractTextNodes(node)).toEqual({
      '0:3': { text: 'A' },
      '0:5': { text: 'B' },
    });
  });

  it('handles missing characters field as empty string', () => {
    const node = { id: '0:1', type: 'TEXT' };
    expect(extractTextNodes(node)).toEqual({ '0:1': { text: '' } });
  });

  it('handles null / undefined gracefully', () => {
    expect(extractTextNodes(null)).toEqual({});
    expect(extractTextNodes(undefined)).toEqual({});
  });
});

describe('extractTextSnapshot', () => {
  const tree = {
    id: '0:0', type: 'DOCUMENT',
    children: [
      {
        id: '0:1', type: 'CANVAS',
        children: [{ id: '0:2', type: 'TEXT', characters: 'JP' }],
      },
      {
        id: '6:6', type: 'CANVAS',
        children: [{ id: '6:7', type: 'TEXT', characters: 'ZH' }],
      },
      {
        id: '6:410', type: 'CANVAS',
        children: [], // 空
      },
    ],
  };

  it('produces snapshot keyed by registered frame id', () => {
    const snap = extractTextSnapshot(tree, ['0:1', '6:6', '6:410']);
    expect(snap).toEqual({
      '0:1': { '0:2': { text: 'JP' } },
      '6:6': { '6:7': { text: 'ZH' } },
      '6:410': {},
    });
  });

  it('omits ids not found in tree', () => {
    const snap = extractTextSnapshot(tree, ['0:1', 'nonexistent:999']);
    expect(Object.keys(snap)).toEqual(['0:1']);
  });

  it('returns empty object for empty registered ids', () => {
    expect(extractTextSnapshot(tree, [])).toEqual({});
  });
});

describe('diffTextSnapshots', () => {
  it('detects added text node', () => {
    const prev = { '0:1': {} };
    const curr = { '0:1': { '0:2': { text: 'Hello' } } };
    expect(diffTextSnapshots(prev, curr)).toEqual([
      { frameId: '0:1', textLayerId: '0:2', before: null, after: 'Hello', action: 'added' },
    ]);
  });

  it('detects modified text node', () => {
    const prev = { '0:1': { '0:2': { text: 'Old' } } };
    const curr = { '0:1': { '0:2': { text: 'New' } } };
    expect(diffTextSnapshots(prev, curr)).toEqual([
      { frameId: '0:1', textLayerId: '0:2', before: 'Old', after: 'New', action: 'modified' },
    ]);
  });

  it('detects removed text node', () => {
    const prev = { '0:1': { '0:2': { text: 'Bye' } } };
    const curr = { '0:1': {} };
    expect(diffTextSnapshots(prev, curr)).toEqual([
      { frameId: '0:1', textLayerId: '0:2', before: 'Bye', after: null, action: 'removed' },
    ]);
  });

  it('handles null prev as all added', () => {
    const curr = { '0:1': { '0:2': { text: 'X' } } };
    expect(diffTextSnapshots(null, curr)).toEqual([
      { frameId: '0:1', textLayerId: '0:2', before: null, after: 'X', action: 'added' },
    ]);
  });

  it('returns empty array when no changes', () => {
    const snap = { '0:1': { '0:2': { text: 'Same' } } };
    expect(diffTextSnapshots(snap, snap)).toEqual([]);
  });

  it('handles multiple frames + multiple changes', () => {
    const prev = { '0:1': { '0:2': { text: 'A' } }, '6:6': {} };
    const curr = { '0:1': { '0:2': { text: 'B' } }, '6:6': { '6:7': { text: 'C' } } };
    const result = diffTextSnapshots(prev, curr);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ frameId: '0:1', textLayerId: '0:2', before: 'A', after: 'B', action: 'modified' });
    expect(result).toContainEqual({ frameId: '6:6', textLayerId: '6:7', before: null, after: 'C', action: 'added' });
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

describe('assertFigmaResponse', () => {
  it('passes on valid response', () => {
    expect(() => assertFigmaResponse({
      version: '123',
      lastModified: '2026-01-01T00:00:00Z',
    })).not.toThrow();
  });

  it('throws when version missing', () => {
    expect(() => assertFigmaResponse({ lastModified: '2026-01-01T00:00:00Z' }))
      .toThrow(/version/);
  });

  it('throws when version is not string', () => {
    expect(() => assertFigmaResponse({ version: 123, lastModified: '2026-01-01T00:00:00Z' }))
      .toThrow(/version/);
  });

  it('throws when lastModified missing', () => {
    expect(() => assertFigmaResponse({ version: '123' }))
      .toThrow(/lastModified/);
  });
});

describe('assertHashStability', () => {
  it('passes when hashing is deterministic', () => {
    expect(() => assertHashStability(v1.document, ['0:1', '6:6'])).not.toThrow();
  });
});

describe('assertDiffDisjoint', () => {
  it('passes on disjoint sets', () => {
    expect(() => assertDiffDisjoint({
      changed: ['a'], added: ['b'], removed: ['c'],
    })).not.toThrow();
  });

  it('throws when id in both changed and added', () => {
    expect(() => assertDiffDisjoint({
      changed: ['x'], added: ['x'], removed: [],
    })).toThrow(/overlap/);
  });

  it('throws when id in both added and removed', () => {
    expect(() => assertDiffDisjoint({
      changed: [], added: ['x'], removed: ['x'],
    })).toThrow(/overlap/);
  });
});

describe('StateSchema', () => {
  it('accepts valid state', () => {
    const valid = {
      checkedAt: '2026-08-10T14:00:00Z',
      workflowRunId: 123,
      fileKey: 'abc',
      figmaVersion: '1000',
      figmaLastModified: '2026-08-10T00:00:00Z',
      treeHash: 'sha256:' + 'a'.repeat(64),
      metaHash: 'sha256:' + 'c'.repeat(64),
      perFrameHash: { '0:1': 'sha256:' + 'b'.repeat(64) },
      changedSinceLastRun: ['0:1'],
      added: [],
      removed: [],
      metaChanged: false,
    };
    expect(() => StateSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid hash format', () => {
    const invalid = {
      checkedAt: '2026-08-10T14:00:00Z',
      workflowRunId: null,
      fileKey: 'abc',
      figmaVersion: '1000',
      figmaLastModified: '2026-08-10T00:00:00Z',
      treeHash: 'not-a-hash',
      metaHash: 'sha256:' + 'c'.repeat(64),
      perFrameHash: {},
      changedSinceLastRun: [],
      added: [],
      removed: [],
      metaChanged: false,
    };
    expect(() => StateSchema.parse(invalid)).toThrow();
  });
});

describe('ConfigSchema', () => {
  it('accepts valid config with frames array', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: ['0:1', '6:6'],
      lastSyncedVersion: null,
    })).not.toThrow();
  });

  it('accepts config with empty frames array', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: [],
      lastSyncedVersion: '12345',
    })).not.toThrow();
  });

  it('rejects legacy map-shaped frames', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: { '0:1': 'src/A.tsx' },
      lastSyncedVersion: null,
    })).toThrow();
  });
});

describe('runCheck integration', () => {
  let tmpDir;
  let configPath;
  let outPath;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `figma-check-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    configPath = join(tmpDir, 'config.json');
    outPath = join(tmpDir, 'state.json');

    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey',
      frames: ['0:1', '6:6', '6:410'],
      lastSyncedVersion: null,
    }));

    process.env.FIGMA_TOKEN = 'fake-token';
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function mockFetch(depth1Response, fullResponse) {
    global.fetch = vi.fn(async (url) => {
      if (url.includes('depth=1')) {
        return { ok: true, status: 200, json: async () => depth1Response };
      }
      return { ok: true, status: 200, json: async () => fullResponse };
    });
  }

  it('first run: all registered frames go into added', async () => {
    mockFetch(v1, v1);
    const diff = await runCheck({ configPath, outPath });
    expect(diff.added.sort()).toEqual(['0:1', '6:410', '6:6']);
    expect(diff.changed).toEqual([]);
    expect(diff.removed).toEqual([]);

    const state = JSON.parse(await readFile(outPath, 'utf8'));
    expect(state.figmaVersion).toBe(v1.version);
    expect(Object.keys(state.perFrameHash).sort()).toEqual(['0:1', '6:410', '6:6']);
  });

  it('v1 → v2: only 6:6 in changed', async () => {
    mockFetch(v1, v1);
    await runCheck({ configPath, outPath });
    // now use output as prev state
    mockFetch(v2, v2);
    const diff = await runCheck({ configPath, outPath, prevStatePath: outPath });
    expect(diff.changed).toEqual(['6:6']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('v1 → v3: added 9:999 is not in registered, no diff impact', async () => {
    mockFetch(v1, v1);
    await runCheck({ configPath, outPath });
    mockFetch(v3, v3);
    const diff = await runCheck({ configPath, outPath, prevStatePath: outPath });
    // 9:999 is NOT in config.frames, so computePerFrameHash won't include it
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('v1 → v4: 6:410 removed → in removed array', async () => {
    mockFetch(v1, v1);
    await runCheck({ configPath, outPath });
    mockFetch(v4, v4);
    const diff = await runCheck({ configPath, outPath, prevStatePath: outPath });
    expect(diff.removed).toEqual(['6:410']);
    expect(diff.changed).toEqual([]);
    expect(diff.added).toEqual([]);
  });

  it('version unchanged: early exit, no full pull', async () => {
    mockFetch(v1, v1);
    await runCheck({ configPath, outPath });

    // reset mock counter, guard against full fetch
    global.fetch = vi.fn(async (url) => {
      if (url.includes('depth=1')) {
        return { ok: true, status: 200, json: async () => v1 };
      }
      throw new Error('should NOT call full fetch');
    });
    const diff = await runCheck({ configPath, outPath, prevStatePath: outPath });
    expect(diff).toEqual({ changed: [], added: [], removed: [], metaChanged: false });
  });
});
