import { describe, it, expect } from 'vitest';
import { mapNodesToFiles } from '../scripts/lib/mapper.js';

const FRAMES = [
  { nodeId: '11-1896', file: 'src/Home.tsx', component: 'Home' },
  { nodeId: '18-6', file: 'src/Play.tsx', component: 'Play' },
];

describe('mapNodesToFiles', () => {
  it('maps registered nodeIds to files', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '11-1896' }, { nodeId: '18-6' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(2);
    expect(result.unregistered).toHaveLength(0);
  });

  it('collects unregistered nodeIds as warning', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '99-99' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.unregistered).toEqual(['99-99']);
  });

  it('dedupes same file mapped by multiple nodeIds', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '11-1896' }, { nodeId: '11-1896' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(1);
  });
});
