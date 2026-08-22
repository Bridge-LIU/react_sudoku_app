import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promoteCandidateSnapshots } from '../scripts/06-confirm.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fs-promote-'));
  mkdirSync(join(root, 'snapshots'));
  mkdirSync(join(root, '_tmp', 'candidate'), { recursive: true });
  return () => rmSync(root, { recursive: true, force: true });
});

it('copies candidate JSON+PNG to snapshots/ and writes index entry', () => {
  writeFileSync(join(root, '_tmp', 'candidate', '1-1.json'), '{"doc":true}', 'utf-8');
  writeFileSync(join(root, '_tmp', 'candidate', '1-1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  promoteCandidateSnapshots({
    syncRoot: root, headVersionId: 'V9',
    changedFrames: [{ nodeId: '1:1', jsonHash: 'J', pngHash: 'P' }]
  });

  expect(existsSync(join(root, 'snapshots', '1-1.json'))).toBe(true);
  expect(existsSync(join(root, 'snapshots', '1-1.png'))).toBe(true);
  const idx = JSON.parse(readFileSync(join(root, 'snapshots', 'index.json'), 'utf-8'));
  expect(idx.frames['1:1'].json_hash).toBe('J');
  expect(idx.frames['1:1'].png_hash).toBe('P');
  expect(idx.frames['1:1'].version_id).toBe('V9');
});

it('handles missing candidate png gracefully (SUSPICIOUS from degraded run)', () => {
  writeFileSync(join(root, '_tmp', 'candidate', '2-2.json'), '{}', 'utf-8');
  // no PNG

  promoteCandidateSnapshots({
    syncRoot: root, headVersionId: 'V9',
    changedFrames: [{ nodeId: '2:2', jsonHash: 'J2', pngHash: null }]
  });

  expect(existsSync(join(root, 'snapshots', '2-2.json'))).toBe(true);
  expect(existsSync(join(root, 'snapshots', '2-2.png'))).toBe(false);
  const idx = JSON.parse(readFileSync(join(root, 'snapshots', 'index.json'), 'utf-8'));
  expect(idx.frames['2:2'].png_hash).toBeNull();
});

it('preserves existing index entries when promoting a subset', () => {
  writeFileSync(join(root, 'snapshots', 'index.json'), JSON.stringify({
    version: 1,
    frames: { '1:1': { json_hash: 'OLD', png_hash: 'OLDP', taken_at: 't0', version_id: 'V0' } }
  }));
  writeFileSync(join(root, '_tmp', 'candidate', '3-3.json'), '{}');

  promoteCandidateSnapshots({
    syncRoot: root, headVersionId: 'V9',
    changedFrames: [{ nodeId: '3:3', jsonHash: 'J3', pngHash: 'P3' }]
  });

  const idx = JSON.parse(readFileSync(join(root, 'snapshots', 'index.json'), 'utf-8'));
  expect(idx.frames['1:1'].json_hash).toBe('OLD');  // untouched
  expect(idx.frames['3:3'].json_hash).toBe('J3');   // new
});
