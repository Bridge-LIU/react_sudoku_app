import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeNodeDiff } from '../scripts/lib/local-diff.mjs';

const fixDir = join(process.cwd(), 'tests', 'fixtures');
const v1 = JSON.parse(readFileSync(join(fixDir, 'snapshot-v1.json'), 'utf-8'));
const v2 = JSON.parse(readFileSync(join(fixDir, 'snapshot-v2.json'), 'utf-8'));

const diffProps = ['name', 'fills', 'characters'];

describe('computeNodeDiff', () => {
  it('両ツリーが等しければ空配列', () => {
    const diff = computeNodeDiff(v1, v1, diffProps);
    expect(diff).toEqual([]);
  });

  it('新規追加された node を added として検出', () => {
    const diff = computeNodeDiff(v1, v2, diffProps);
    const added = diff.filter(d => d.kind === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].nodeId).toBe('1:3');
  });

  it('削除された node を removed として検出', () => {
    const diff = computeNodeDiff(v2, v1, diffProps);
    const removed = diff.filter(d => d.kind === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].nodeId).toBe('1:3');
  });

  it('修正された node を modified として検出、変更プロパティを列挙', () => {
    const diff = computeNodeDiff(v1, v2, diffProps);
    const modified = diff.filter(d => d.kind === 'modified');
    const titleDiff = modified.find(m => m.nodeId === '1:2');
    expect(titleDiff).toBeDefined();
    expect(titleDiff.changedProps).toContain('name');
    expect(titleDiff.changedProps).toContain('characters');
    const homeDiff = modified.find(m => m.nodeId === '1:1');
    expect(homeDiff).toBeDefined();
    expect(homeDiff.changedProps).toContain('fills');
  });

  it('diffProps に無いプロパティの変更は無視', () => {
    const s1 = { document: { id: '0:0', children: [{ id: '1:1', name: 'X', opacity: 1.0 }] } };
    const s2 = { document: { id: '0:0', children: [{ id: '1:1', name: 'X', opacity: 0.5 }] } };
    const diff = computeNodeDiff(s1, s2, ['name']);
    expect(diff).toEqual([]);
  });

  it('snapshot が null（初回）なら全 node を added として返す', () => {
    const diff = computeNodeDiff(null, v1, diffProps);
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.every(d => d.kind === 'added')).toBe(true);
  });

  it('深く入れ子になった children も再帰的に diff できる', () => {
    const s1 = { document: { id: '0:0', children: [
      { id: '1:1', name: 'A', children: [
        { id: '1:2', name: 'B', children: [
          { id: '1:3', name: 'C' }
        ]}
      ]}
    ]}};
    const s2 = { document: { id: '0:0', children: [
      { id: '1:1', name: 'A', children: [
        { id: '1:2', name: 'B', children: [
          { id: '1:3', name: 'C-changed' }
        ]}
      ]}
    ]}};
    const diff = computeNodeDiff(s1, s2, ['name']);
    expect(diff).toHaveLength(1);
    expect(diff[0].nodeId).toBe('1:3');
    expect(diff[0].kind).toBe('modified');
  });

  it('大量 node（1000 個）でも安定動作', () => {
    const makeSnap = (n, prefix) => ({
      document: { id: '0:0', children: Array.from({length: n}, (_, i) => ({
        id: `1:${i}`, name: `${prefix}${i}`
      }))}
    });
    const s1 = makeSnap(1000, 'A');
    const s2 = makeSnap(1000, 'B');
    const diff = computeNodeDiff(s1, s2, ['name']);
    expect(diff).toHaveLength(1000);
    expect(diff.every(d => d.kind === 'modified')).toBe(true);
  });
});
