import { createHash } from 'node:crypto';

const ROOT_STRIP_KEYS = new Set(['thumbnailUrl', 'lastModified']);
const BOUNDING_BOX_KEYS_KEEP = new Set(['width', 'height']);

export function normalizeFigmaJson(node) {
  if (Array.isArray(node)) return node.map(normalizeFigmaJson);
  if (node === null || typeof node !== 'object') return node;

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (ROOT_STRIP_KEYS.has(k)) continue;
    if (k === 'absoluteBoundingBox' || k === 'absoluteRenderBounds') {
      out[k] = {};
      for (const [bk, bv] of Object.entries(v || {})) {
        if (BOUNDING_BOX_KEYS_KEEP.has(bk)) out[k][bk] = bv;
      }
      continue;
    }
    if (k === 'imageRef') continue; // inside fills / background
    out[k] = normalizeFigmaJson(v);
  }
  return out;
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256OfJson(obj) {
  return sha256Hex(Buffer.from(canonicalStringify(obj), 'utf-8'));
}

function canonicalStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(v[k])).join(',') + '}';
}
