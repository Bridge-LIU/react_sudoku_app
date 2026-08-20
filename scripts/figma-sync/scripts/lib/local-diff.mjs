function flatten(snapshot) {
  const map = new Map();
  if (!snapshot || !snapshot.document) return map;
  function walk(node) {
    map.set(node.id, node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  }
  walk(snapshot.document);
  return map;
}

function propsDiffer(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function computeNodeDiff(oldSnapshot, newSnapshot, diffProps) {
  const oldMap = flatten(oldSnapshot);
  const newMap = flatten(newSnapshot);
  const diffs = [];

  for (const [id, node] of newMap) {
    if (!oldMap.has(id)) {
      diffs.push({ kind: 'added', nodeId: id, node });
    } else {
      const oldNode = oldMap.get(id);
      const changedProps = diffProps.filter(p => propsDiffer(oldNode[p], node[p]));
      if (changedProps.length > 0) {
        diffs.push({ kind: 'modified', nodeId: id, changedProps, node });
      }
    }
  }

  for (const [id, node] of oldMap) {
    if (!newMap.has(id)) {
      diffs.push({ kind: 'removed', nodeId: id, node });
    }
  }

  return diffs;
}
