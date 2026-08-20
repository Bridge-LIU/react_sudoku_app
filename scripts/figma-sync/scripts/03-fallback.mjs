import { computeNodeDiff } from './lib/local-diff.mjs';

/**
 * Phase 1-b-fallback: 全量取得 + 本地 JS diff
 */
export async function runFallback({ mcp, config, headVersionId, previousSnapshot }) {
  const tree = await mcp.getFileAtVersion({
    fileUrl: config.figmaFileUrl,
    version_id: headVersionId,
    depth: 3
  });

  const sizeBytes = JSON.stringify(tree).length;
  const maxBytes = config.fallback?.maxSnapshotBytes || 5242880;
  if (sizeBytes > maxBytes) {
    return { status: 'OVERSIZED', sizeBytes, maxBytes };
  }

  const newSnapshot = {
    ...tree,
    version_id: headVersionId,
    fetched_at: new Date().toISOString()
  };

  if (!previousSnapshot) {
    return { status: 'INITIAL', nodeDiffs: [], newSnapshot };
  }

  const rawDiffs = computeNodeDiff(previousSnapshot, tree, config.diffProps);
  if (rawDiffs.length === 0) {
    return { status: 'NO_CHANGE', nodeDiffs: [], newSnapshot };
  }

  const nodeDiffs = rawDiffs.map(d => ({
    nodeId: d.nodeId,
    nodeName: d.node?.name,
    nodeType: d.node?.type,
    kind: d.kind,
    changedProps: d.changedProps || []
  }));

  return { status: 'CHANGED', nodeDiffs, newSnapshot };
}
