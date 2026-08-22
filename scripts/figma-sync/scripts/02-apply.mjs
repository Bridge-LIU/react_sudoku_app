import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 2 (v5): Apply — 変化した部品を React へ書き戻し
 *
 * Vue 開発者向けメモ:
 * - v4 では nodeDiff + snapshot から descendant → 登記 frame を解決する resolver が必要だった。
 * - v5 では Task 3 の detect が事前に registered frame まで解決した nodeId 一覧を
 *   `_tmp/changed-frames.json` に書き出す。ここは受け取った ID を素直に上書きするだけ。
 * - 破壊的操作の前に `${target}.bak` を書き出す（rollback safety net、v4 との継続性）。
 *
 * @param {object} params
 * @param {object} params.mcp - MCP client (getDesignContext を持つ)
 * @param {object} params.config - config.json 相当（figmaFileKey / reactAppRoot / frames を持つ）
 * @param {string[]} params.changedFrameIds - 登記 frame の nodeId 一覧（Task 3 の出力）
 * @returns {Promise<{changedFiles: string[], unregistered: string[], errors: Array<{nodeId: string, error: string}>}>}
 */
export async function applyChanges({ mcp, config, changedFrameIds }) {
  const frameById = new Map((config.frames || []).map(f => [f.nodeId, f]));
  const changedFiles = [];
  const unregistered = [];
  const errors = [];

  for (const nodeId of changedFrameIds) {
    const frame = frameById.get(nodeId);
    if (!frame) {
      unregistered.push(nodeId);
      continue;
    }

    let ctx;
    try {
      ctx = await mcp.getDesignContext({ nodeId, fileKey: config.figmaFileKey });
    } catch (e) {
      errors.push({ nodeId, error: e.message });
      continue;
    }

    const jsx = ctx && ctx.jsx;
    if (!jsx) {
      errors.push({ nodeId, error: 'empty jsx' });
      continue;
    }

    const target = join(config.reactAppRoot, frame.file);
    if (existsSync(target)) {
      const original = readFileSync(target, 'utf-8');
      writeFileSync(`${target}.bak`, original, 'utf-8');
    }
    writeFileSync(target, jsx, 'utf-8');
    changedFiles.push(frame.file);
  }

  return { changedFiles, unregistered, errors };
}
