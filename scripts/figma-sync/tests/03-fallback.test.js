import { describe, it, expect, vi } from 'vitest';
import { runFallback } from '../scripts/03-fallback.mjs';

const treeV1 = { document: { id: '0:0', children: [{ id: '1:1', name: 'A' }] } };
const treeV2 = { document: { id: '0:0', children: [{ id: '1:1', name: 'B' }] } };

const cfg = {
  figmaFileUrl: 'https://example.com/file',
  diffProps: ['name'],
  fallback: { maxSnapshotBytes: 5000000 }
};

describe('03-fallback: Phase 1-b-fallback', () => {
  it('前回 snapshot が null なら INITIAL 判定 + snapshot 作成のみ', async () => {
    const mcp = {
      getFileAtVersion: vi.fn().mockResolvedValue(treeV1)
    };

    const result = await runFallback({
      mcp,
      config: cfg,
      headVersionId: 'v1',
      previousSnapshot: null
    });

    expect(result.status).toBe('INITIAL');
    expect(result.nodeDiffs).toEqual([]);
    expect(result.newSnapshot.version_id).toBe('v1');
  });

  it('前回 snapshot ありで実際に差分ありなら CHANGED + NodeDiff', async () => {
    const mcp = {
      getFileAtVersion: vi.fn().mockResolvedValue(treeV2)
    };

    const result = await runFallback({
      mcp,
      config: cfg,
      headVersionId: 'v2',
      previousSnapshot: { ...treeV1, version_id: 'v1' }
    });

    expect(result.status).toBe('CHANGED');
    expect(result.nodeDiffs).toHaveLength(1);
    expect(result.nodeDiffs[0].nodeId).toBe('1:1');
    expect(result.newSnapshot.version_id).toBe('v2');
  });

  it('前回 snapshot と全く同じなら NO_CHANGE（真に変化なし）', async () => {
    const mcp = {
      getFileAtVersion: vi.fn().mockResolvedValue(treeV1)
    };

    const result = await runFallback({
      mcp,
      config: cfg,
      headVersionId: 'v1',
      previousSnapshot: { ...treeV1, version_id: 'v0' }
    });

    expect(result.status).toBe('NO_CHANGE');
    expect(result.nodeDiffs).toEqual([]);
  });

  it('レスポンスサイズが maxSnapshotBytes を超えたら OVERSIZED status', async () => {
    const bigTree = { document: { id: '0:0', children: Array.from({length: 100000}, (_, i) => ({ id: `1:${i}`, name: 'x'.repeat(100) })) } };
    const mcp = {
      getFileAtVersion: vi.fn().mockResolvedValue(bigTree)
    };

    const result = await runFallback({
      mcp,
      config: { ...cfg, fallback: { maxSnapshotBytes: 1000 } },
      headVersionId: 'v1',
      previousSnapshot: null
    });

    expect(result.status).toBe('OVERSIZED');
  });
});
