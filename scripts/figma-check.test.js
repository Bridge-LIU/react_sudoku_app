import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertFigmaResponse, fetchWithRetry, StateSchema, ConfigSchema, runCheck } from './figma-check.js';
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

  it('throws on null response', () => {
    expect(() => assertFigmaResponse(null)).toThrow(/malformed/);
  });
});

describe('fetchWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns response immediately on 2xx', async () => {
    const mockRes = { ok: true, status: 200 };
    globalThis.fetch = vi.fn(async () => mockRes);
    const res = await fetchWithRetry('http://x', {});
    expect(res).toBe(mockRes);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns 4xx (non-429) without retrying', async () => {
    const mockRes = { ok: false, status: 404, headers: new Map() };
    globalThis.fetch = vi.fn(async () => mockRes);
    const res = await fetchWithRetry('http://x', {});
    expect(res).toBe(mockRes);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts when Retry-After exceeds 60s cap', async () => {
    const headers = new Map([['retry-after', '374210']]);
    const mockRes = { ok: false, status: 429, headers };
    globalThis.fetch = vi.fn(async () => mockRes);
    const res = await fetchWithRetry('http://x', {}, 3);
    expect(res).toBe(mockRes);
    // 一度呼ばれて即 abort（retry せず）
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('StateSchema (v3)', () => {
  const validState = {
    schemaVersion: 3,
    figmaVersion: 'v100',
    figmaLastModified: '2026-08-17T00:00:00Z',
    checkedAt: '2026-08-17T00:00:00Z',
    workflowRunId: 123,
    hasChanges: true,
    fileKey: 'abc',
  };

  it('accepts valid v3 state', () => {
    expect(() => StateSchema.parse(validState)).not.toThrow();
  });

  it('accepts workflowRunId=null', () => {
    expect(() => StateSchema.parse({ ...validState, workflowRunId: null })).not.toThrow();
  });

  it('rejects schemaVersion != 3', () => {
    expect(() => StateSchema.parse({ ...validState, schemaVersion: 2 })).toThrow();
  });

  it('rejects missing hasChanges', () => {
    const { hasChanges, ...rest } = validState;
    expect(() => StateSchema.parse(rest)).toThrow();
  });

  it('rejects v2-style state with textSnapshot (clean break)', () => {
    const v2State = {
      ...validState,
      schemaVersion: 2,
      textSnapshot: {},
    };
    expect(() => StateSchema.parse(v2State)).toThrow();
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

  it('accepts config with langMap', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: ['0:1', '6:6'],
      lastSyncedVersion: null,
      langMap: { '0:1': 'ja', '6:6': 'zh' },
    })).not.toThrow();
  });

  it('accepts config without langMap (optional)', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: ['0:1'],
      lastSyncedVersion: null,
    })).not.toThrow();
  });

  it('rejects non-string lang code', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: ['0:1'],
      lastSyncedVersion: null,
      langMap: { '0:1': 123 },
    })).toThrow();
  });

  it('rejects legacy map-shaped frames', () => {
    expect(() => ConfigSchema.parse({
      fileKey: 'abc',
      frames: { '0:1': 'src/A.tsx' },
      lastSyncedVersion: null,
    })).toThrow();
  });
});

describe('runCheck v3 integration', () => {
  let tmpDir;
  let configPath;
  let outPath;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `figma-check-v3-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    configPath = join(tmpDir, 'config.json');
    outPath = join(tmpDir, 'state.json');
    process.env.FIGMA_TOKEN = 'fake-token';
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    delete process.env.FIGMA_TOKEN;
  });

  function mockDepth1(depth1Response) {
    globalThis.fetch = vi.fn(async (url) => {
      if (!url.includes('depth=1')) {
        throw new Error(`v3 should ONLY call depth=1, got: ${url}`);
      }
      return { ok: true, status: 200, json: async () => depth1Response };
    });
  }

  it('first run (no prev state): hasChanges=true, writes v3 state', async () => {
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey',
      frames: ['0:1', '6:6'],
      lastSyncedVersion: null,
    }));

    mockDepth1({ version: 'v1', lastModified: '2026-08-17T00:00:00Z' });

    const result = await runCheck({ configPath, outPath });
    expect(result.hasChanges).toBe(true);
    expect(result.figmaVersion).toBe('v1');

    const state = JSON.parse(await readFile(outPath, 'utf8'));
    expect(state.schemaVersion).toBe(3);
    expect(state.figmaVersion).toBe('v1');
    expect(state.hasChanges).toBe(true);
    expect(state.fileKey).toBe('testkey');
    // v3 は絶対 full fetch しない
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('version unchanged + skill acknowledged: hasChanges=false', async () => {
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey',
      frames: ['0:1'],
      lastSyncedVersion: 'v1',
    }));
    const prevPath = join(tmpDir, 'prev.json');
    await writeFile(prevPath, JSON.stringify({
      schemaVersion: 3,
      figmaVersion: 'v1',
      figmaLastModified: '2026-08-17T00:00:00Z',
      checkedAt: '2026-08-17T00:00:00Z',
      workflowRunId: null,
      hasChanges: false,
      fileKey: 'testkey',
    }));

    mockDepth1({ version: 'v1', lastModified: '2026-08-17T00:00:00Z' });

    const result = await runCheck({ configPath, outPath, prevStatePath: prevPath });
    expect(result.hasChanges).toBe(false);

    const state = JSON.parse(await readFile(outPath, 'utf8'));
    expect(state.hasChanges).toBe(false);
    expect(state.figmaVersion).toBe('v1');
  });

  it('version changed: hasChanges=true', async () => {
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey',
      frames: ['0:1'],
      lastSyncedVersion: 'v1',
    }));
    const prevPath = join(tmpDir, 'prev.json');
    await writeFile(prevPath, JSON.stringify({
      schemaVersion: 3,
      figmaVersion: 'v1',
      figmaLastModified: '2026-08-17T00:00:00Z',
      checkedAt: '2026-08-17T00:00:00Z',
      workflowRunId: null,
      hasChanges: false,
      fileKey: 'testkey',
    }));

    mockDepth1({ version: 'v2', lastModified: '2026-08-17T01:00:00Z' });

    const result = await runCheck({ configPath, outPath, prevStatePath: prevPath });
    expect(result.hasChanges).toBe(true);
    expect(result.figmaVersion).toBe('v2');
  });

  it('prev.figmaVersion matches but lastSyncedVersion stale: hasChanges=true (skill未追随)', async () => {
    // scenario: workflow が既に v2 を検知して state 書いたが、skill がまだ v1 のまま
    // → 次の workflow は依然 hasChanges=true を保つべき
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey',
      frames: ['0:1'],
      lastSyncedVersion: 'v1', // skill 未追随
    }));
    const prevPath = join(tmpDir, 'prev.json');
    await writeFile(prevPath, JSON.stringify({
      schemaVersion: 3,
      figmaVersion: 'v2',
      figmaLastModified: '2026-08-17T00:00:00Z',
      checkedAt: '2026-08-17T00:00:00Z',
      workflowRunId: null,
      hasChanges: true,
      fileKey: 'testkey',
    }));

    mockDepth1({ version: 'v2', lastModified: '2026-08-17T00:00:00Z' });

    const result = await runCheck({ configPath, outPath, prevStatePath: prevPath });
    expect(result.hasChanges).toBe(true);
  });

  it('reads GITHUB_RUN_ID into workflowRunId', async () => {
    process.env.GITHUB_RUN_ID = '456';
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey', frames: ['0:1'], lastSyncedVersion: null,
    }));
    mockDepth1({ version: 'v1', lastModified: '2026-08-17T00:00:00Z' });

    await runCheck({ configPath, outPath });
    const state = JSON.parse(await readFile(outPath, 'utf8'));
    expect(state.workflowRunId).toBe(456);

    delete process.env.GITHUB_RUN_ID;
  });

  it('missing FIGMA_TOKEN throws', async () => {
    delete process.env.FIGMA_TOKEN;
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey', frames: ['0:1'], lastSyncedVersion: null,
    }));
    await expect(runCheck({ configPath, outPath })).rejects.toThrow(/FIGMA_TOKEN/);
  });

  it('malformed prev state file: treats as first run (does not crash)', async () => {
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey', frames: ['0:1'], lastSyncedVersion: null,
    }));
    const prevPath = join(tmpDir, 'prev.json');
    await writeFile(prevPath, 'not-json{{{');

    mockDepth1({ version: 'v1', lastModified: '2026-08-17T00:00:00Z' });

    const result = await runCheck({ configPath, outPath, prevStatePath: prevPath });
    expect(result.hasChanges).toBe(true);
  });

  it('missing prev state file (ENOENT): silent, treats as first run', async () => {
    await writeFile(configPath, JSON.stringify({
      fileKey: 'testkey', frames: ['0:1'], lastSyncedVersion: null,
    }));
    const prevPath = join(tmpDir, 'does-not-exist.json');

    mockDepth1({ version: 'v1', lastModified: '2026-08-17T00:00:00Z' });

    const result = await runCheck({ configPath, outPath, prevStatePath: prevPath });
    expect(result.hasChanges).toBe(true);
  });
});
