import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyChanges, resolveToRegisteredFrame } from '../scripts/05-apply.mjs';

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

  it('descendant nodeId + snapshot → 親 chain を辿って登記 frame に解決される', async () => {
    // 12:3615 (ResetDialog) の下に 12:3980 (Dialog) がある構造
    const cfgWithDialog = {
      reactAppRoot: testRoot,
      frames: [
        { nodeId: '11:1896', file: 'src/app/index.tsx', component: 'Home' },
        { nodeId: '12:3615', file: 'src/ui/ConfirmDialog.tsx', component: 'ResetDialog' }
      ]
    };
    mkdirSync(join(testRoot, 'src', 'ui'), { recursive: true });
    const dialogPath = join(testRoot, 'src/ui/ConfirmDialog.tsx');
    writeFileSync(dialogPath, 'export default function ResetDialog() { return <div>old</div>; }');

    const snapshot = {
      nodes: {
        '12:3615': {
          document: {
            id: '12:3615',
            name: 'ResetDialog',
            children: [
              {
                id: '12:3970',
                name: 'Wrapper',
                children: [
                  { id: '12:3980', name: 'Dialog', children: [] }
                ]
              }
            ]
          }
        }
      }
    };

    const mcp = {
      getDesignContext: vi.fn().mockResolvedValue({
        jsx: 'export default function ResetDialog() { return <div>new dialog</div>; }'
      })
    };

    const result = await applyChanges({
      mcp, config: cfgWithDialog,
      nodeDiffs: [{ nodeId: '12:3980', nodeName: 'Dialog', kind: 'modified' }],
      snapshot
    });

    expect(result.changedFiles).toContain('src/ui/ConfirmDialog.tsx');
    expect(result.unregistered).toHaveLength(0);
    // 登記 frame の nodeId (12:3615) で JSX 取得（descendant ではなく）
    expect(mcp.getDesignContext).toHaveBeenCalledWith({ nodeId: '12:3615' });
    expect(readFileSync(dialogPath, 'utf-8')).toContain('new dialog');
  });

  it('snapshot が無い場合は descendant nodeId は unregistered のまま（既存挙動保持）', async () => {
    const mcp = { getDesignContext: vi.fn() };
    const result = await applyChanges({
      mcp, config: cfg,
      nodeDiffs: [{ nodeId: '12:3980', nodeName: 'Dialog' }]
      // snapshot 未指定
    });
    expect(result.unregistered).toContain('12:3980');
    expect(mcp.getDesignContext).not.toHaveBeenCalled();
  });

  it('snapshot に存在しない nodeId は unregistered', async () => {
    const snapshot = {
      nodes: {
        '11:1896': { document: { id: '11:1896', children: [] } }
      }
    };
    const mcp = { getDesignContext: vi.fn() };
    const result = await applyChanges({
      mcp, config: cfg,
      nodeDiffs: [{ nodeId: '99:999' }],
      snapshot
    });
    expect(result.unregistered).toContain('99:999');
  });

  it('resolveToRegisteredFrame: 直接一致は即返す（fast path）', () => {
    const framesMap = new Map([['12:3615', { nodeId: '12:3615', file: 'a.tsx' }]]);
    const snapshot = { nodes: { '12:3615': { document: { id: '12:3615', children: [] } } } };
    const result = resolveToRegisteredFrame('12:3615', snapshot, framesMap);
    expect(result?.nodeId).toBe('12:3615');
  });

  it('resolveToRegisteredFrame: snapshot / nodeId が空なら null', () => {
    expect(resolveToRegisteredFrame('12:3980', null, new Map())).toBeNull();
    expect(resolveToRegisteredFrame(null, {}, new Map())).toBeNull();
  });
});
