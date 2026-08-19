import stringify from 'fast-json-stable-stringify';
import crypto from 'node:crypto';

export function canonicalize(obj) {
  return stringify(obj);
}

export function hashNode(node, diffProps) {
  const picked = {};
  for (const prop of diffProps) {
    if (node[prop] !== undefined) picked[prop] = node[prop];
  }
  return crypto.createHash('sha256').update(canonicalize(picked)).digest('hex');
}
