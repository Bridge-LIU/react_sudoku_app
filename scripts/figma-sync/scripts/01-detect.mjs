import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  readIndex, persistFrameSnapshot, verdictForFrame
} from './lib/snapshot.mjs';
import { normalizeFigmaJson, sha256OfJson, sha256Hex } from './lib/hash.mjs';

export async function detect({ syncRoot, config, state, fetchers }) {
  const headRes = await fetchers.headVersion();
  const headVersionId = headRes?.versions?.[0]?.id;
  if (!headVersionId) return { status: 'FIGMA_EMPTY', headVersionId: null };

  if (state?.last_version_id && state.last_version_id === headVersionId) {
    return { status: 'NO_CHANGE', headVersionId, frames: [] };
  }

  const snapshotsDir = join(syncRoot, 'snapshots');
  const tmpDir = join(syncRoot, '_tmp');
  mkdirSync(tmpDir, { recursive: true });
  const index = readIndex(snapshotsDir);

  const results = [];
  for (const frame of config.frames || []) {
    const snap = await fetchers.nodeSnapshot({
      fileKey: config.figmaFileKey, nodeId: frame.nodeId, versionId: headVersionId
    });
    const rawNode = snap?.nodes?.[frame.nodeId]?.document ?? snap?.nodes?.[frame.nodeId] ?? null;
    if (rawNode == null) {
      results.push({ nodeId: frame.nodeId, verdict: 'SUSPICIOUS', reason: 'node not found in HEAD JSON' });
      continue;
    }

    const jsonHash = sha256OfJson(normalizeFigmaJson(rawNode));

    let pngBuf = null;
    let pngHash = null;
    try {
      pngBuf = await fetchers.framePng({ fileKey: config.figmaFileKey, nodeId: frame.nodeId });
      pngHash = pngBuf ? sha256Hex(pngBuf) : null;
    } catch (err) {
      pngHash = null;
    }

    persistFrameSnapshot(join(syncRoot, '_tmp', 'candidate'), frame.nodeId, snap.nodes[frame.nodeId], pngBuf);

    const baseline = index.frames[frame.nodeId] || null;
    const verdict = verdictForFrame({ jsonHash, pngHash }, baseline);
    results.push({
      nodeId: frame.nodeId, component: frame.component, file: frame.file,
      verdict, jsonHash, pngHash,
      baselineJson: baseline?.json_hash ?? null,
      baselinePng:  baseline?.png_hash  ?? null
    });
  }

  const changed = results.filter(f => f.verdict !== 'NO_CHANGE');
  writeFileSync(join(tmpDir, 'changed-frames.json'), JSON.stringify(changed, null, 2), 'utf-8');

  return {
    status: changed.length === 0 ? 'NO_CHANGE' : 'CHANGED',
    headVersionId,
    frames: results
  };
}
