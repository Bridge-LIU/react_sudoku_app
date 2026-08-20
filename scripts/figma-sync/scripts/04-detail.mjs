function findNodeById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  if (Array.isArray(root.children)) {
    for (const c of root.children) {
      const found = findNodeById(c, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Phase 1-c: 変わった node の詳細取得
 */
export async function fetchDetail({ mcp, config, headVersionId, nodeDiffs, existingTree }) {
  const nodeIds = nodeDiffs.map(d => d.nodeId);

  if (nodeIds.length === 0) {
    return { nodes: {} };
  }

  if (existingTree) {
    const nodes = {};
    for (const id of nodeIds) {
      const found = findNodeById(existingTree.document, id);
      if (found) nodes[id] = found;
    }
    return { nodes };
  }

  const raw = await mcp.getFileAtVersion({
    fileUrl: config.figmaFileUrl,
    version_id: headVersionId,
    node_ids: nodeIds
  });

  return { nodes: raw.nodes || {}, raw };
}
