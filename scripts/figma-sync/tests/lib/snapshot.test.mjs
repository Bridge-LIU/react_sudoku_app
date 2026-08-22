import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readIndex, writeIndex, snapshotPathsFor,
  persistFrameSnapshot, verdictForFrame
} from '../../scripts/lib/snapshot.mjs';

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fs-snap-'));
  return () => rmSync(dir, { recursive: true, force: true });
});

describe('readIndex / writeIndex', () => {
  it('returns empty skeleton when index.json missing', () => {
    const idx = readIndex(dir);
    expect(idx).toEqual({ version: 1, frames: {} });
  });

  it('round-trips through disk', () => {
    const idx = { version: 1, frames: { '1:2': { json_hash: 'j', png_hash: 'p', taken_at: 't', version_id: 'v' } } };
    writeIndex(dir, idx);
    expect(readIndex(dir)).toEqual(idx);
  });
});

describe('snapshotPathsFor', () => {
  it('uses safe filename with hyphen instead of colon', () => {
    const p = snapshotPathsFor(dir, '11:1896');
    expect(p.json).toBe(join(dir, '11-1896.json'));
    expect(p.png).toBe(join(dir, '11-1896.png'));
  });
});

describe('persistFrameSnapshot', () => {
  it('writes JSON and PNG files', () => {
    persistFrameSnapshot(dir, '1:2', { document: { id: '1:2' } }, Buffer.from([0x89, 0x50]));
    const p = snapshotPathsFor(dir, '1:2');
    expect(existsSync(p.json)).toBe(true);
    expect(existsSync(p.png)).toBe(true);
    expect(JSON.parse(readFileSync(p.json, 'utf-8'))).toEqual({ document: { id: '1:2' } });
  });
});

describe('verdictForFrame', () => {
  it('returns NO_CHANGE when both hashes match baseline', () => {
    expect(verdictForFrame({ jsonHash: 'j', pngHash: 'p' }, { json_hash: 'j', png_hash: 'p' }))
      .toBe('NO_CHANGE');
  });
  it('returns CHANGED when both hashes differ', () => {
    expect(verdictForFrame({ jsonHash: 'j2', pngHash: 'p2' }, { json_hash: 'j', png_hash: 'p' }))
      .toBe('CHANGED');
  });
  it('returns SUSPICIOUS when only one hash differs', () => {
    expect(verdictForFrame({ jsonHash: 'j', pngHash: 'p2' }, { json_hash: 'j', png_hash: 'p' }))
      .toBe('SUSPICIOUS');
  });
  it('returns CHANGED when no baseline exists (first run)', () => {
    expect(verdictForFrame({ jsonHash: 'j', pngHash: 'p' }, null)).toBe('CHANGED');
  });
  it('degrades SUSPICIOUS when png hash unavailable but JSON differs', () => {
    expect(verdictForFrame({ jsonHash: 'j2', pngHash: null }, { json_hash: 'j', png_hash: 'p' }))
      .toBe('SUSPICIOUS');
  });
});
