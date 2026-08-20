import { describe, it, expect, vi } from 'vitest';
import { fetchDetail } from '../scripts/04-detail.mjs';

const cfg = { figmaFileUrl: 'https://example.com/file' };

describe('04-detail: Phase 1-c', () => {
  it('nodeDiffs から node_id を集めて getFileAtVersion を呼ぶ', async () => {
    const mcp = {
      getFileAtVersion: vi.fn().mockResolvedValue({
        document: { id: '0:0', children: [] },
        nodes: { '11:1896': { document: { id: '11:1896', name: 'X' } } }
      })
    };
    const nodeDiffs = [
      { nodeId: '11:1896' },
      { nodeId: '18:6' }
    ];

    const result = await fetchDetail({ mcp, config: cfg, headVersionId: 'v1', nodeDiffs });

    expect(mcp.getFileAtVersion).toHaveBeenCalledWith({
      fileUrl: cfg.figmaFileUrl,
      version_id: 'v1',
      node_ids: ['11:1896', '18:6']
    });
    expect(result.nodes).toBeDefined();
  });

  it('fallback 経路のように既に tree があれば MCP を呼ばず tree から抜き出す', async () => {
    const mcp = { getFileAtVersion: vi.fn() };
    const existingTree = {
      document: {
        id: '0:0',
        children: [{ id: '1:1', name: 'Home', children: [{ id: '11:1896', name: 'Target' }] }]
      }
    };
    const nodeDiffs = [{ nodeId: '11:1896' }];

    const result = await fetchDetail({
      mcp, config: cfg, headVersionId: 'v1', nodeDiffs, existingTree
    });

    expect(mcp.getFileAtVersion).not.toHaveBeenCalled();
    expect(result.nodes['11:1896']).toBeDefined();
    expect(result.nodes['11:1896'].name).toBe('Target');
  });

  it('nodeDiffs 空なら MCP を呼ばず空 nodes を返す', async () => {
    const mcp = { getFileAtVersion: vi.fn() };
    const result = await fetchDetail({ mcp, config: cfg, headVersionId: 'v1', nodeDiffs: [] });
    expect(mcp.getFileAtVersion).not.toHaveBeenCalled();
    expect(result.nodes).toEqual({});
  });
});
