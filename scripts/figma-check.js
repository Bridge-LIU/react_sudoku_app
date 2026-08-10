import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';

export function canonicalize(obj) {
  return stringify(obj);
}

export function sha256(str) {
  return 'sha256:' + createHash('sha256').update(str).digest('hex');
}
