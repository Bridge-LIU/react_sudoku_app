import { describe, it, expect } from 'vitest';
import { loadConfig } from '../scripts/lib/config-loader.js';

describe('config-loader', () => {
  it('reads config.json and returns parsed object', () => {
    const config = loadConfig();
    expect(config.figmaFileKey).toBe('cwmewA4MTWktw6E7uhQFK2');
    expect(config.frames).toBeInstanceOf(Array);
    expect(config.frames.length).toBeGreaterThan(0);
  });

  it('throws when config.json is missing required field', () => {
    expect(() => loadConfig({ figmaFileKey: undefined })).toThrow(/figmaFileKey/);
  });
});
