/**
 * Phase 1-a: 変化検出
 *
 * @param {object} args
 * @param {object} args.mcp     - MCP client (getFileVersions 必須)
 * @param {object} args.state   - loadState(...) の返却物
 * @param {object} args.config  - loadConfig(...) の返却物
 * @returns {Promise<{status, headVersionId, lastVersionId?}>}
 *   status: 'NO_STATE' | 'NO_CHANGE' | 'CHANGED' | 'FIGMA_EMPTY'
 */
export async function detect({ mcp, state, config }) {
  const res = await mcp.getFileVersions({
    fileUrl: config.figmaFileUrl,
    max_versions: 1,
    include_autosaves: true
  });

  if (!res.versions || res.versions.length === 0) {
    return { status: 'FIGMA_EMPTY' };
  }

  const headVersionId = res.versions[0].id;

  if (!state.last_version_id) {
    return { status: 'NO_STATE', headVersionId };
  }

  if (state.last_version_id === headVersionId) {
    return { status: 'NO_CHANGE', headVersionId };
  }

  return { status: 'CHANGED', headVersionId, lastVersionId: state.last_version_id };
}
