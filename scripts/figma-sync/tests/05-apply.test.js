import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyChanges } from '../scripts/05-apply.mjs';

const testRoot = join(process.cwd(), '.test-tmp-apply');

describe('05-apply: Phase 3', () => {
  beforeEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
    mkdirSync(join(testRoot, 'src', 'app'), { recursive: true });
  });
  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
  });

  const cfg = {
    reactAppRoot: testRoot,
    frames: [
      { nodeId: '11:1896', file: 'src/app/index.tsx', component: 'Home' },
      { nodeId: '18:6',    file: 'src/app/play.tsx', component: 'Play' }
    ]
  };

  it('登記された nodeId は React file を直接上書き（.bak なし、rollback は git 側）', async () => {
    const targetPath = join(testRoot, 'src/app/index.tsx');
    writeFileSync(targetPath, 'export default function Home() { return <div>old</div>; }');

    const mcp = {
      getDesignContext: vi.fn().mockResolvedValue({
        jsx: 'export default function Home() { return <div>new</div>; }'
      })
    };

    const result = await applyChanges({
      mcp, config: cfg,
      nodeDiffs: [{ nodeId: '11:1896', nodeName: 'Home' }]
    });

    expect(result.changedFiles).toContain('src/app/index.tsx');
    expect(existsSync(targetPath + '.bak')).toBe(false);
    expect(readFileSync(targetPath, 'utf-8')).toContain('new');
  });

  it('未登記の nodeId は unregistered warning に載せて file 触らない', async () => {
    const mcp = { getDesignContext: vi.fn() };

    const result = await applyChanges({
      mcp, config: cfg,
      nodeDiffs: [{ nodeId: '99:999', nodeName: 'Unknown' }]
    });

    expect(result.unregistered).toContain('99:999');
    expect(mcp.getDesignContext).not.toHaveBeenCalled();
  });

  it('get_design_context 失敗時は該当 file skip して他続行', async () => {
    writeFileSync(join(testRoot, 'src/app/index.tsx'), 'old');
    writeFileSync(join(testRoot, 'src/app/play.tsx'), 'old');

    const mcp = {
      getDesignContext: vi.fn()
        .mockRejectedValueOnce(new Error('MCP fail'))
        .mockResolvedValueOnce({ jsx: 'new play' })
    };

    const result = await applyChanges({
      mcp, config: cfg,
      nodeDiffs: [
        { nodeId: '11:1896' },
        { nodeId: '18:6' }
      ]
    });

    expect(result.changedFiles).toContain('src/app/play.tsx');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].nodeId).toBe('11:1896');
  });
});
