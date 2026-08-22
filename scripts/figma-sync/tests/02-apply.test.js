import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyChanges } from '../scripts/02-apply.mjs';

describe('02-apply (v5): applyChanges', () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fs-apply-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'a.tsx'), 'old contents', 'utf-8');
    return () => rmSync(root, { recursive: true, force: true });
  });

  const mkCfg = () => ({
    reactAppRoot: root,
    figmaFileKey: 'K',
    frames: [
      { nodeId: '1:1', file: 'src/a.tsx', component: 'A' },
      { nodeId: '2:2', file: 'src/b.tsx', component: 'B' }
    ]
  });

  it('writes only the frames listed in changedFrameIds', async () => {
    const mcp = { getDesignContext: async ({ nodeId }) => ({ jsx: `NEW-${nodeId}` }) };
    const res = await applyChanges({ mcp, config: mkCfg(), changedFrameIds: ['1:1'] });
    expect(res.changedFiles).toEqual(['src/a.tsx']);
    expect(readFileSync(join(root, 'src', 'a.tsx'), 'utf-8')).toBe('NEW-1:1');
    expect(existsSync(join(root, 'src', 'b.tsx'))).toBe(false);
  });

  it('creates .bak of original file before overwrite', async () => {
    const mcp = { getDesignContext: async () => ({ jsx: 'NEW' }) };
    await applyChanges({ mcp, config: mkCfg(), changedFrameIds: ['1:1'] });
    expect(readFileSync(join(root, 'src', 'a.tsx.bak'), 'utf-8')).toBe('old contents');
  });

  it('collects nodeIds not in config.frames as unregistered', async () => {
    const mcp = { getDesignContext: async () => ({ jsx: 'x' }) };
    const res = await applyChanges({ mcp, config: mkCfg(), changedFrameIds: ['99:99'] });
    expect(res.unregistered).toEqual(['99:99']);
    expect(res.changedFiles).toEqual([]);
  });

  it('records error for empty jsx and does not overwrite', async () => {
    const mcp = { getDesignContext: async () => ({ jsx: '' }) };
    const res = await applyChanges({ mcp, config: mkCfg(), changedFrameIds: ['1:1'] });
    expect(res.errors).toEqual([{ nodeId: '1:1', error: 'empty jsx' }]);
    expect(readFileSync(join(root, 'src', 'a.tsx'), 'utf-8')).toBe('old contents');
  });
});
