import { createHash } from 'node:crypto';
import stringify from 'fast-json-stable-stringify';

export function canonicalize(obj) {
  return stringify(obj);
}

export function sha256(str) {
  return 'sha256:' + createHash('sha256').update(str).digest('hex');
}

export function findNode(tree, nodeId) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.id === nodeId) return tree;
  for (const child of tree.children || []) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function computePerFrameHash(tree, registeredIds) {
  const result = {};
  for (const id of registeredIds) {
    const node = findNode(tree, id);
    if (node) {
      result[id] = sha256(canonicalize(node));
    }
  }
  return result;
}

// 漏検リスク #1・#2 対応：frame 子樹外の共有 style / component 定義を捕捉
export function computeMetaHash(fileResponse) {
  const meta = {
    styles: fileResponse.styles || {},
    components: fileResponse.components || {},
    componentSets: fileResponse.componentSets || {},
  };
  return sha256(canonicalize(meta));
}

export function diffHashes(prev, curr) {
  const prevMap = prev || {};
  const prevKeys = new Set(Object.keys(prevMap));
  const currKeys = new Set(Object.keys(curr));

  const changed = [];
  const added = [];
  const removed = [];

  for (const id of currKeys) {
    if (!prevKeys.has(id)) {
      added.push(id);
    } else if (prevMap[id] !== curr[id]) {
      changed.push(id);
    }
  }
  for (const id of prevKeys) {
    if (!currKeys.has(id)) {
      removed.push(id);
    }
  }

  return {
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
  };
}
