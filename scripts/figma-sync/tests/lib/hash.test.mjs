import { describe, it, expect } from 'vitest';
import { normalizeFigmaJson, sha256Hex, sha256OfJson } from '../../scripts/lib/hash.mjs';

describe('normalizeFigmaJson', () => {
  it('strips thumbnailUrl at root', () => {
    const input = { thumbnailUrl: 'https://signed.example/x', name: 'a' };
    expect(normalizeFigmaJson(input)).toEqual({ name: 'a' });
  });

  it('strips absoluteBoundingBox x/y but keeps width/height', () => {
    const input = {
      absoluteBoundingBox: { x: 100, y: 200, width: 50, height: 30 },
      cornerRadius: 10
    };
    expect(normalizeFigmaJson(input)).toEqual({
      absoluteBoundingBox: { width: 50, height: 30 },
      cornerRadius: 10
    });
  });

  it('strips lastModified at root', () => {
    expect(normalizeFigmaJson({ lastModified: '2026-08-22T14:05:14Z', name: 'x' }))
      .toEqual({ name: 'x' });
  });

  it('strips imageRef inside background fills', () => {
    const input = { background: [{ type: 'IMAGE', imageRef: 'abc' }] };
    expect(normalizeFigmaJson(input)).toEqual({ background: [{ type: 'IMAGE' }] });
  });

  it('recurses into children[]', () => {
    const input = {
      name: 'root',
      children: [{ name: 'c', absoluteBoundingBox: { x: 1, y: 2, width: 3, height: 4 } }]
    };
    expect(normalizeFigmaJson(input)).toEqual({
      name: 'root',
      children: [{ name: 'c', absoluteBoundingBox: { width: 3, height: 4 } }]
    });
  });
});

describe('sha256 helpers', () => {
  it('sha256Hex returns 64-char hex for a Buffer', () => {
    const h = sha256Hex(Buffer.from('hello'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('sha256OfJson is stable across key ordering', () => {
    const a = sha256OfJson({ a: 1, b: 2 });
    const b = sha256OfJson({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('sha256OfJson differs when a value changes', () => {
    expect(sha256OfJson({ x: 1 })).not.toBe(sha256OfJson({ x: 2 }));
  });
});
