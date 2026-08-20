import { describe, it, expect, vi } from 'vitest';
import { runDiff } from '../scripts/02-diff.mjs';

describe('02-diff: Phase 1-b', () => {
  const cfg = {
    figmaFileUrl: 'https://example.com/file',
    frames: [
      { nodeId: '11:1896', file: 'a.tsx', component: 'A' },
      { nodeId: '18:6',    file: 'b.tsx', component: 'B' }
    ]
  };

  it('scoped_nodes に change_count > 0 の node があれば NodeDiff を返す', async () => {
    const mcp = {
      diffVersions: vi.fn().mockResolvedValue({
        scoped_nodes: [
          { node_id: '11:1896', change_count: 2, children_added: [{ id: 'x:1' }], binding_changes: [] },
          { node_id: '18:6', change_count: 0 }
        ],
        page_structure: { pages_added: [], pages_removed: [], pages_renamed: [] }
      })
    };

    const result = await runDiff({ mcp, config: cfg, fromVersion: 'v1', toVersion: 'v2' });

    expect(result.nodeDiffs).toHaveLength(1);
    expect(result.nodeDiffs[0].nodeId).toBe('11:1896');
    expect(mcp.diffVersions).toHaveBeenCalledWith({
      fileUrl: cfg.figmaFileUrl,
      from_version: 'v1',
      to_version: 'v2',
      component_ids: ['11:1896', '18:6'],
      mode: 'detailed'
    });
  });

  it('全 scoped_nodes が change_count === 0 なら空配列', async () => {
    const mcp = {
      diffVersions: vi.fn().mockResolvedValue({
        scoped_nodes: [
          { node_id: '11:1896', change_count: 0 },
          { node_id: '18:6', change_count: 0 }
        ],
        page_structure: { pages_added: [], pages_removed: [], pages_renamed: [] }
      })
    };

    const result = await runDiff({ mcp, config: cfg, fromVersion: 'v1', toVersion: 'v2' });

    expect(result.nodeDiffs).toEqual([]);
  });

  it('page_structure に変更があれば warnings に載せる', async () => {
    const mcp = {
      diffVersions: vi.fn().mockResolvedValue({
        scoped_nodes: [],
        page_structure: {
          pages_added: [{ id: 'p:1', name: 'NewPage' }],
          pages_removed: [],
          pages_renamed: []
        }
      })
    };

    const result = await runDiff({ mcp, config: cfg, fromVersion: 'v1', toVersion: 'v2' });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('page');
  });
});
