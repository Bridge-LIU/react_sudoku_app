import { describe, it, expect } from 'vitest';
import { diffImages } from '../scripts/lib/screenshot.js';
import { PNG } from 'pngjs';

function mkSolidPng(w, h, rgb) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('diffImages', () => {
  it('returns 0 diff pixels for identical images', () => {
    const a = mkSolidPng(50, 50, [255, 0, 0]);
    const { diffPixels } = diffImages(a, a);
    expect(diffPixels).toBe(0);
  });

  it('returns high diff pixels for different colors', () => {
    const a = mkSolidPng(50, 50, [255, 0, 0]);
    const b = mkSolidPng(50, 50, [0, 255, 0]);
    const { diffPixels } = diffImages(a, b);
    expect(diffPixels).toBe(2500);
  });
});
