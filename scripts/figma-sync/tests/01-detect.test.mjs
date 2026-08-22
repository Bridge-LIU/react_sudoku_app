import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detect } from '../scripts/01-detect.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fs-detect-'));
  mkdirSync(join(root, 'snapshots'));
  return () => rmSync(root, { recursive: true, force: true });
});

const cfg = {
  figmaFileKey: 'FILEKEY',
  frames: [
    { nodeId: '1:1', file: 'a.tsx', component: 'A' },
    { nodeId: '2:2', file: 'b.tsx', component: 'B' }
  ]
};

function fakeHead(vid) { return { versions: [{ id: vid }] }; }
function fakeNodeSnapshot(nodeId, tag) {
  return { nodes: { [nodeId]: { document: { id: nodeId, name: tag } } } };
}

it('short-circuits NO_CHANGE when HEAD == state.last', async () => {
  const res = await detect({
    syncRoot: root, config: cfg,
    state: { last_version_id: 'V1' },
    fetchers: {
      headVersion: async () => fakeHead('V1'),
      nodeSnapshot: async () => { throw new Error('should not fetch'); },
      framePng: async () => { throw new Error('should not fetch'); }
    }
  });
  expect(res.status).toBe('NO_CHANGE');
  expect(res.headVersionId).toBe('V1');
});

it('flags all frames CHANGED on first run (no baseline)', async () => {
  const res = await detect({
    syncRoot: root, config: cfg,
    state: { last_version_id: null },
    fetchers: {
      headVersion: async () => fakeHead('V1'),
      nodeSnapshot: async ({ nodeId }) => fakeNodeSnapshot(nodeId, 'new'),
      framePng: async () => Buffer.from([0x89, 0x50])
    }
  });
  expect(res.status).toBe('CHANGED');
  expect(res.frames.map(f => f.verdict)).toEqual(['CHANGED', 'CHANGED']);
});

it('emits _tmp/changed-frames.json listing only changed frames', async () => {
  const res = await detect({
    syncRoot: root, config: cfg,
    state: { last_version_id: 'V0' },
    fetchers: {
      headVersion: async () => fakeHead('V1'),
      nodeSnapshot: async ({ nodeId }) => fakeNodeSnapshot(nodeId, 'x'),
      framePng: async () => Buffer.from([0x89, 0x50])
    }
  });
  const changedPath = join(root, '_tmp', 'changed-frames.json');
  expect(existsSync(changedPath)).toBe(true);
  const written = JSON.parse(readFileSync(changedPath, 'utf-8'));
  expect(written).toEqual(res.frames.filter(f => f.verdict !== 'NO_CHANGE'));
});

it('propagates errors from nodeSnapshot (fail-fast on frame fetch)', async () => {
  await expect(detect({
    syncRoot: root, config: cfg,
    state: { last_version_id: 'V0' },
    fetchers: {
      headVersion: async () => fakeHead('V1'),
      nodeSnapshot: async () => { throw new Error('boom'); },
      framePng: async () => Buffer.from([0x89, 0x50])
    }
  })).rejects.toThrow('boom');
});

it('mixes verdicts: NO_CHANGE for baseline-match frames, CHANGED for new ones', async () => {
  // Seed index.json with a baseline for frame 1:1 that matches what we'll hash below
  const { writeFileSync: writeFS, mkdirSync: mkdirFS } = await import('node:fs');
  const { normalizeFigmaJson, sha256OfJson, sha256Hex } = await import('../scripts/lib/hash.mjs');
  const doc = { id: '1:1', name: 'stable' };
  const rawNode = { document: doc };
  const jsonHash = sha256OfJson(normalizeFigmaJson(doc));
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const pngHash = sha256Hex(pngBytes);
  mkdirFS(join(root, 'snapshots'), { recursive: true });
  writeFS(join(root, 'snapshots', 'index.json'), JSON.stringify({
    version: 1,
    frames: { '1:1': { json_hash: jsonHash, png_hash: pngHash, taken_at: 't', version_id: 'V0' } }
  }), 'utf-8');

  const res = await detect({
    syncRoot: root, config: cfg,
    state: { last_version_id: 'V0' },
    fetchers: {
      headVersion: async () => fakeHead('V1'),
      nodeSnapshot: async ({ nodeId }) => ({ nodes: { [nodeId]: nodeId === '1:1' ? rawNode : { document: { id: nodeId, name: 'new' } } } }),
      framePng: async ({ nodeId }) => nodeId === '1:1' ? pngBytes : Buffer.from([0x99])
    }
  });

  const byId = Object.fromEntries(res.frames.map(f => [f.nodeId, f.verdict]));
  expect(byId['1:1']).toBe('NO_CHANGE');
  expect(byId['2:2']).toBe('CHANGED');

  // changed-frames.json must only contain the CHANGED frame
  const written = JSON.parse(readFileSync(join(root, '_tmp', 'changed-frames.json'), 'utf-8'));
  expect(written.map(f => f.nodeId)).toEqual(['2:2']);
});
