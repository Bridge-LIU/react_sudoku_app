import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
 * @returns {Promise<{changedFiles: string[], unregistered: string[], errors: Array}>}
 */
export async function applyChanges({ mcp, config, nodeDiffs }) {
  const frameById = new Map(config.frames.map(f => [f.nodeId, f]));
  const changedFiles = [];
  const unregistered = [];
  const errors = [];

  for (const diff of nodeDiffs) {
    const frame = frameById.get(diff.nodeId);
    if (!frame) {
      unregistered.push(diff.nodeId);
      continue;
    }

    const absPath = join(config.reactAppRoot, frame.file);
    if (!existsSync(absPath)) {
      errors.push({ nodeId: diff.nodeId, file: frame.file, reason: 'file not found' });
      continue;
    }

    try {
      const ctx = await mcp.getDesignContext({ nodeId: diff.nodeId });
      writeFileSync(absPath, ctx.jsx, 'utf-8');
      changedFiles.push(frame.file);
    } catch (e) {
      errors.push({ nodeId: diff.nodeId, file: frame.file, reason: e.message });
    }
  }

  return { changedFiles, unregistered, errors };
}
