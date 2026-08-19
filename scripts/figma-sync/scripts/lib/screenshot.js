import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export function diffImages(bufA, bufB, threshold = 0.1) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  return { diffPixels, diffPng: PNG.sync.write(diff) };
}
