function flatten(snapshot) {
  const map = new Map();
  if (!snapshot) return map;

  const trees = [];
  if (snapshot.document) {
    trees.push(snapshot.document);
  } else if (snapshot.nodes && typeof snapshot.nodes === 'object') {
    for (const wrapper of Object.values(snapshot.nodes)) {
      if (wrapper && wrapper.document) trees.push(wrapper.document);
    }
  }

  function walk(node) {
    if (!node || !node.id) return;
    map.set(node.id, node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  }

  for (const tree of trees) walk(tree);
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
