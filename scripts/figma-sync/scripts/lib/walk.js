export function buildWalkPayload({ pageIds, diffProps }) {
  const pageIdsJson = JSON.stringify(pageIds);
  const diffPropsJson = JSON.stringify(diffProps);
  return `
const TARGET_PAGE_IDS = ${pageIdsJson};
const DIFF_PROPS = ${diffPropsJson};

function walk(node) {
  const out = { id: node.id, name: node.name, type: node.type };
  for (const prop of DIFF_PROPS) {
    if (node[prop] !== undefined) out[prop] = node[prop];
  }
  if (node.children) {
    out.children = node.children.map(walk);
  }
  return out;
}

const result = {};
for (const pageId of TARGET_PAGE_IDS) {
  const page = figma.getNodeById(pageId);
  if (!page) throw new Error("Page " + pageId + " not found");
  result[pageId] = walk(page);
}

return JSON.stringify({
  version: figma.root.version,
  lastModified: new Date().toISOString(),
  pages: result
});
`.trim();
}
