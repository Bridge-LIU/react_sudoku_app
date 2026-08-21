import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * snapshot から parent chain を辿り、config.frames に登記されている最も近い ancestor を返す。
 *
 * Vue 開発者向けメモ:
 * - fallback (local diff) は Figma tree の全 depth を走査するため、
 *   `12:3980`（=登記 frame `12:3615` の子孫 Dialog）のような descendant nodeId が
 *   nodeDiff に載る。それを親方向に辿って登記済み frame にマッピングする。
 * - snapshot shape: `{ nodes: { <frameId>: { document: { id, children[] } } } }`
 *
 * @param {string} nodeId - 解決したい nodeId
 * @param {object} snapshot - last-full.json 相当（nodes/document 構造）
 * @param {Map<string, object>} framesMap - config.frames を nodeId でキー化したもの
 * @returns {object|null} マッチした frame エントリ、なければ null
 */
export function resolveToRegisteredFrame(nodeId, snapshot, framesMap) {
  if (!nodeId || !snapshot) return null;

  // parentMap を build（child.id → parent.id）
  const parentMap = new Map();
  const seen = new Set();

  const trees = [];
  if (snapshot.document) {
    trees.push(snapshot.document);
  } else if (snapshot.nodes && typeof snapshot.nodes === 'object') {
    for (const wrapper of Object.values(snapshot.nodes)) {
      if (wrapper && wrapper.document) trees.push(wrapper.document);
    }
  }

  function walk(node, parentId) {
    if (!node || !node.id || seen.has(node.id)) return;
    seen.add(node.id);
    if (parentId !== null) parentMap.set(node.id, parentId);
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child, node.id);
    }
  }
  for (const tree of trees) walk(tree, null);

  // 対象 nodeId が snapshot に存在するかチェック（=祖先も含めて存在する保証）
  if (!seen.has(nodeId)) return null;

  // 自身 → 親 → 親 の順で framesMap を検索
  let cur = nodeId;
  const guard = new Set();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    const hit = framesMap.get(cur);
    if (hit) return hit;
    cur = parentMap.get(cur);
  }
  return null;
}

/**
 * Phase 3: 変化した部品を React へ書き戻し
 *
 * Vue 開発者向けメモ:
 * - Vue の `<script setup>` を差し替えるのと同じイメージで、
 *   Figma から取得した JSX を対応する React ファイルに上書きする。
 * - 破壊的操作だが git 管理下のため、rollback は Phase 7 で `git restore` に一任。
 *
 * @param {object} params
 * @param {object} params.mcp - MCP client (getDesignContext を持つ)
 * @param {object} params.config - config.json 相当の設定
 * @param {Array<{nodeId: string, nodeName?: string}>} params.nodeDiffs - Phase2 の差分結果
 * @param {object} [params.snapshot] - fallback path 経由の場合の tree snapshot（descendant 解決用）
 * @returns {Promise<{changedFiles: string[], unregistered: string[], errors: Array}>}
 */
export async function applyChanges({ mcp, config, nodeDiffs, snapshot }) {
  const frameById = new Map(config.frames.map(f => [f.nodeId, f]));
  const changedFiles = [];
  const unregistered = [];
  const errors = [];
  const appliedFrameIds = new Set();  // 同一 frame が複数 descendant で hit しても 1回だけ

  for (const diff of nodeDiffs) {
    // Fast path: nodeId が直接登記されている
    let frame = frameById.get(diff.nodeId);
    let resolvedFromDescendant = false;

    // Fallback: snapshot が与えられていれば parent chain を辿る
    if (!frame && snapshot) {
      frame = resolveToRegisteredFrame(diff.nodeId, snapshot, frameById);
      if (frame) resolvedFromDescendant = true;
    }

    if (!frame) {
      unregistered.push(diff.nodeId);
      continue;
    }

    // 同一 frame への重複適用を避ける
    if (appliedFrameIds.has(frame.nodeId)) continue;

    const absPath = join(config.reactAppRoot, frame.file);
    if (!existsSync(absPath)) {
      errors.push({ nodeId: diff.nodeId, file: frame.file, reason: 'file not found' });
      continue;
    }

    try {
      // 登記された frame の nodeId で JSX 取得（descendant ではなく frame 全体）
      const ctx = await mcp.getDesignContext({ nodeId: frame.nodeId });
      writeFileSync(absPath, ctx.jsx, 'utf-8');
      changedFiles.push(frame.file);
      appliedFrameIds.add(frame.nodeId);
      if (resolvedFromDescendant) {
        // 情報用（テスト/デバッグで確認しやすいよう記録）
        // errors ではなく通常フロー
      }
    } catch (e) {
      errors.push({ nodeId: diff.nodeId, file: frame.file, reason: e.message });
    }
  }

  return { changedFiles, unregistered, errors };
}
