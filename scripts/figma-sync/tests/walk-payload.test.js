import { describe, it, expect } from 'vitest';
import { buildWalkPayload } from '../scripts/lib/walk.js';

describe('walk.js payload builder', () => {
  it('embeds page IDs and diff props into JS string', () => {
    const payload = buildWalkPayload({
      pageIds: ['0:1', '6:6'],
      diffProps: ['name', 'fills'],
    });
    expect(payload).toContain('"0:1"');
    expect(payload).toContain('"6:6"');
    expect(payload).toContain('"name"');
    expect(payload).toContain('"fills"');
    expect(payload).toContain('lastModified');
    expect(payload).toContain('figma.getNodeByIdAsync');
  });

  it('produces valid JavaScript (parses without syntax error)', () => {
    const payload = buildWalkPayload({
      pageIds: ['0:1'],
      diffProps: ['name'],
    });
    expect(() => new Function('return (async () => {' + payload + '})()')).not.toThrow();
  });
});
