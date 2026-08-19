import { hashNode } from './canonicalize.js';

function flattenNodes(dump) {
  const map = new Map();
  if (!dump || !dump.pages) return map;
  const visit = (node) => {
    map.set(node.id, node);
    if (node.children) node.children.forEach(visit);
  };
  Object.values(dump.pages).forEach(visit);
  return map;
}

export function computeDiff(previous, current, diffProps) {
  const prev = flattenNodes(previous);
  const cur = flattenNodes(current);
  const added = [];
  const removed = [];
  const modified = [];

  for (const [id, node] of cur) {
    if (!prev.has(id)) {
      added.push({ nodeId: id, type: node.type, name: node.name });
    } else {
      const prevNode = prev.get(id);
      if (hashNode(prevNode, diffProps) !== hashNode(node, diffProps)) {
        const diff = {};
        for (const prop of diffProps) {
          if (JSON.stringify(prevNode[prop]) !== JSON.stringify(node[prop])) {
            diff[prop] = { before: prevNode[prop], after: node[prop] };
          }
        }
        modified.push({ nodeId: id, type: node.type, name: node.name, diff });
      }
    }
  }
  for (const [id, node] of prev) {
    if (!cur.has(id)) {
      removed.push({ nodeId: id, type: node.type, name: node.name });
    }
  }
  return { added, removed, modified };
}
