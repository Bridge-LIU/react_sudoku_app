import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRunDir, promoteSnapshot } from '../scripts/lib/run-context.js';

describe('run-context', () => {
  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-'));
  });

  it('createRunDir creates timestamp-named folder', () => {
    const dir = createRunDir(tmpRoot);
    expect(fs.existsSync(dir)).toBe(true);
    expect(path.basename(dir)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}\d*$/);
  });

  it('promoteSnapshot moves current to previous', () => {
    const snapDir = path.join(tmpRoot, 'snapshots');
    fs.mkdirSync(path.join(snapDir, 'current'), { recursive: true });
    fs.writeFileSync(path.join(snapDir, 'current', 'dump.json'), '{"v":1}');
    promoteSnapshot(snapDir);
    expect(fs.existsSync(path.join(snapDir, 'previous', 'dump.json'))).toBe(true);
    expect(fs.readFileSync(path.join(snapDir, 'previous', 'dump.json'), 'utf-8')).toBe('{"v":1}');
    expect(fs.existsSync(path.join(snapDir, 'current', 'dump.json'))).toBe(false);
  });
});
