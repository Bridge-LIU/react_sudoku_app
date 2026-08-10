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

export function assertFigmaResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('Figma response malformed: not an object');
  }
  if (!response.version || typeof response.version !== 'string') {
    throw new Error('Figma response malformed: missing or invalid version (check PAT or API changes)');
  }
  if (!response.lastModified || typeof response.lastModified !== 'string') {
    throw new Error('Figma response malformed: missing or invalid lastModified');
  }
}

export function assertHashStability(tree, registeredIds) {
  const first = computePerFrameHash(tree, registeredIds);
  const second = computePerFrameHash(tree, registeredIds);
  for (const id of registeredIds) {
    if (first[id] !== second[id]) {
      throw new Error(`Hash non-deterministic for ${id} (canonical serializer bug)`);
    }
  }
}

export function assertDiffDisjoint({ changed, added, removed }) {
  const c = new Set(changed);
  const a = new Set(added);
  const r = new Set(removed);
  for (const id of c) {
    if (a.has(id)) throw new Error(`Diff set overlap: ${id} in changed and added`);
    if (r.has(id)) throw new Error(`Diff set overlap: ${id} in changed and removed`);
  }
  for (const id of a) {
    if (r.has(id)) throw new Error(`Diff set overlap: ${id} in added and removed`);
  }
}
