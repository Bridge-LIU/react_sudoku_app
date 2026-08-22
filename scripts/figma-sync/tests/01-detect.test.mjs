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
