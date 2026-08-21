import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterActiveThreads,
  formatCommentList,
  fetchComments,
} from './figma-comments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'figma-comments-sample.json'), 'utf8')
);

describe('filterActiveThreads', () => {
  it('keeps only unresolved top-level threads (drops replies + resolved)', () => {
    const out = filterActiveThreads(sample.comments);
    const ids = out.map((c) => c.id);
    expect(ids).toEqual(['1894149162', '1873825754']);
  });

  it('returns [] when input is empty', () => {
    expect(filterActiveThreads([])).toEqual([]);
  });
});

describe('formatCommentList', () => {
  const fileKey = 'cwmewA4MTWktw6E7uhQFK2';

  it('renders header with count when there are entries', () => {
    const active = filterActiveThreads(sample.comments);
    const out = formatCommentList(active, { fileKey });
    expect(out).toMatch(/未処理コメント\s*2\s*件/);
  });

  it('renders empty-state message when no active threads', () => {
    const out = formatCommentList([], { fileKey });
    expect(out).toMatch(/未処理コメントなし/);
  });

  it('includes author, JST time, node_id, message body, and figma pin link', () => {
    const active = filterActiveThreads(sample.comments);
    const out = formatCommentList(active, { fileKey });
    expect(out).toContain('Kurihara Naoko');
    // 2026-08-21T00:17:42Z → JST は 09:17
    expect(out).toContain('2026-08-21 09:17 JST');
    expect(out).toContain('228:2');
    expect(out).toContain('删除掉这个文本');
    expect(out).toContain(`https://www.figma.com/file/${fileKey}`);
    expect(out).toContain('node-id=228-2');
    expect(out).toContain('#comment=1894149162');
  });
});

describe('fetchComments', () => {
  it('calls the correct URL with X-Figma-Token header', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ comments: [] }),
    });
    await fetchComments('KEY123', 'TOKEN_ABC', { fetchFn });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.figma.com/v1/files/KEY123/comments');
    expect(opts.headers['X-Figma-Token']).toBe('TOKEN_ABC');
  });

  it('throws with clear message on 401 and does not leak the token', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    await expect(
      fetchComments('KEY123', 'SECRET_TOKEN', { fetchFn })
    ).rejects.toThrow(/401/);
    try {
      await fetchComments('KEY123', 'SECRET_TOKEN', { fetchFn });
    } catch (e) {
      expect(e.message).not.toContain('SECRET_TOKEN');
    }
  });

  it('throws a helpful error on network failure', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      fetchComments('KEY123', 'TOKEN', { fetchFn })
    ).rejects.toThrow(/ECONNRESET|network|failed/i);
  });
});
