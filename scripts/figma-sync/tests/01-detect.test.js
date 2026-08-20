import { describe, it, expect, vi } from 'vitest';
import { detect } from '../scripts/01-detect.mjs';

const makeMock = (versions) => ({
  getFileVersions: vi.fn().mockResolvedValue({ versions })
});

describe('01-detect: Phase 1-a', () => {
  it('state 空の初回起動 → NO_STATE を返して head を返す', async () => {
    const mcp = makeMock([{ id: 'v-new' }]);
    const state = {};
    const cfg = { figmaFileUrl: 'https://example.com/file' };

    const result = await detect({ mcp, state, config: cfg });

    expect(result.status).toBe('NO_STATE');
    expect(result.headVersionId).toBe('v-new');
    expect(mcp.getFileVersions).toHaveBeenCalledWith({
      fileUrl: 'https://example.com/file',
      max_versions: 1,
      include_autosaves: true
    });
  });

  it('state の last_version_id == head → NO_CHANGE を返す', async () => {
    const mcp = makeMock([{ id: 'v-same' }]);
    const state = { last_version_id: 'v-same' };
    const cfg = { figmaFileUrl: 'https://example.com/file' };

    const result = await detect({ mcp, state, config: cfg });

    expect(result.status).toBe('NO_CHANGE');
    expect(result.headVersionId).toBe('v-same');
  });

  it('state の last_version_id != head → CHANGED を返す', async () => {
    const mcp = makeMock([{ id: 'v-new' }]);
    const state = { last_version_id: 'v-old' };
    const cfg = { figmaFileUrl: 'https://example.com/file' };

    const result = await detect({ mcp, state, config: cfg });

    expect(result.status).toBe('CHANGED');
    expect(result.headVersionId).toBe('v-new');
    expect(result.lastVersionId).toBe('v-old');
  });

  it('レスポンスに versions が空なら FIGMA_EMPTY を返す', async () => {
    const mcp = makeMock([]);
    const result = await detect({ mcp, state: {}, config: { figmaFileUrl: 'x' } });
    expect(result.status).toBe('FIGMA_EMPTY');
  });

  it('MCP がエラーを throw したらそのまま伝播', async () => {
    const mcp = {
      getFileVersions: vi.fn().mockRejectedValue(new Error('MCP timeout'))
    };
    await expect(detect({ mcp, state: {}, config: { figmaFileUrl: 'x' } }))
      .rejects.toThrow('MCP timeout');
  });
});
