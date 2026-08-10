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
