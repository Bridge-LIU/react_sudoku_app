/**
 * Phase 1-b: NodeDiff 抽出（figma_diff_versions 経由）
 */
export async function runDiff({ mcp, config, fromVersion, toVersion }) {
  const componentIds = config.frames.map(f => f.nodeId);

  const raw = await mcp.diffVersions({
    fileUrl: config.figmaFileUrl,
    from_version: fromVersion,
    to_version: toVersion,
    component_ids: componentIds,
    mode: 'detailed'
  });

  const nodeDiffs = (raw.scoped_nodes || [])
    .filter(n => (n.change_count || 0) > 0)
    .map(n => ({
      nodeId: n.node_id,
      nodeName: n.node_name,
      nodeType: n.node_type,
      childrenAdded: n.children_added || [],
      childrenRemoved: n.children_removed || [],
      bindingChanges: n.binding_changes || [],
      nameChanged: n.name_changed,
      descriptionChanged: n.description_changed
    }));

  const warnings = [];
  const ps = raw.page_structure || {};
  if ((ps.pages_added || []).length > 0) {
    warnings.push(`page added: ${ps.pages_added.map(p => p.name).join(', ')}`);
  }
  if ((ps.pages_removed || []).length > 0) {
    warnings.push(`page removed: ${ps.pages_removed.map(p => p.name).join(', ')}`);
  }
  if ((ps.pages_renamed || []).length > 0) {
    warnings.push(`page renamed`);
  }

  return { nodeDiffs, warnings, raw };
}
