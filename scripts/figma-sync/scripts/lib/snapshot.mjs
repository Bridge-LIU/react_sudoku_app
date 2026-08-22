import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const INDEX_NAME = 'index.json';

export function readIndex(snapshotsDir) {
  const p = join(snapshotsDir, INDEX_NAME);
  if (!existsSync(p)) return { version: 1, frames: {} };
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export function writeIndex(snapshotsDir, idx) {
  mkdirSync(snapshotsDir, { recursive: true });
  writeFileSync(join(snapshotsDir, INDEX_NAME), JSON.stringify(idx, null, 2), 'utf-8');
}

export function snapshotPathsFor(snapshotsDir, nodeId) {
  const safe = String(nodeId).replace(/:/g, '-');
  return {
    json: join(snapshotsDir, `${safe}.json`),
    png:  join(snapshotsDir, `${safe}.png`)
  };
}

export function persistFrameSnapshot(snapshotsDir, nodeId, rawJson, pngBuf) {
  mkdirSync(snapshotsDir, { recursive: true });
  const p = snapshotPathsFor(snapshotsDir, nodeId);
  writeFileSync(p.json, JSON.stringify(rawJson, null, 2), 'utf-8');
  if (pngBuf) writeFileSync(p.png, pngBuf);
  return p;
}

export function verdictForFrame(current, baseline) {
  if (!baseline) return 'CHANGED';
  const jsonSame = current.jsonHash === baseline.json_hash;
  const pngSame  = current.pngHash === baseline.png_hash;
  if (current.pngHash === null) {
    return jsonSame ? 'SUSPICIOUS' : 'SUSPICIOUS';
  }
  if (jsonSame && pngSame) return 'NO_CHANGE';
  if (!jsonSame && !pngSame) return 'CHANGED';
  return 'SUSPICIOUS';
}
