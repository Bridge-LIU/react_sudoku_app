import { describe, it, expect } from 'vitest';
import { computeDiff } from '../scripts/lib/diff.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIFF_PROPS = ['name', 'fills'];
const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8'));

describe('computeDiff', () => {
  it('detects color modification', () => {
    const result = computeDiff(load('dump-v1.json'), load('dump-v2-color.json'), DIFF_PROPS);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].nodeId).toBe('11-1896');
    expect(result.modified[0].diff).toHaveProperty('fills');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects added node', () => {
    const result = computeDiff(load('dump-v1.json'), load('dump-v2-added.json'), DIFF_PROPS);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].nodeId).toBe('11-9999');
    expect(result.modified).toHaveLength(0);
  });

  it('empty diff when identical', () => {
    const v1 = load('dump-v1.json');
    const result = computeDiff(v1, v1, DIFF_PROPS);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });

  it('previous null (baseline case) treats all current as added', () => {
    const result = computeDiff(null, load('dump-v1.json'), DIFF_PROPS);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });
});
