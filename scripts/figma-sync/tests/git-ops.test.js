import { describe, it, expect } from 'vitest';
import { buildCommitMessage } from '../scripts/lib/git-ops.js';

describe('buildCommitMessage', () => {
  it('produces JP commit with file list and nodeIds', () => {
    const msg = buildCommitMessage({
      changedFiles: [
        { file: 'src/Home.tsx', appliedNodeIds: ['11-1896'] },
        { file: 'src/Play.tsx', appliedNodeIds: ['18-6'] },
      ],
      reportPath: 'runs/2026-08-19_1430/report.xlsx',
    });
    expect(msg).toMatch(/^機能更新/);
    expect(msg).toContain('src/Home.tsx');
    expect(msg).toContain('src/Play.tsx');
    expect(msg).toContain('11-1896');
    expect(msg).toContain('report.xlsx');
    expect(msg).toContain('Co-Authored-By: Claude');
  });
});
