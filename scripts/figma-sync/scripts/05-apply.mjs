import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 3: 変化した部品を React へ書き戻し
 *
 * Vue 開発者向けメモ:
 * - Vue の `<script setup>` を差し替えるのと同じイメージで、
 *   Figma から取得した JSX を対応する React ファイルに上書きする。
 * - 破壊的操作なので必ず `.bak` バックアップを取り、失敗時は復元。
 *
 * @param {object} params
 * @param {object} params.mcp - MCP client (getDesignContext を持つ)
 * @param {object} params.config - .figma-sync.json 相当の設定
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
      copyFileSync(absPath, absPath + '.bak');
      const ctx = await mcp.getDesignContext({ nodeId: diff.nodeId });
      writeFileSync(absPath, ctx.jsx, 'utf-8');
      changedFiles.push(frame.file);
    } catch (e) {
      errors.push({ nodeId: diff.nodeId, file: frame.file, reason: e.message });
      // 失敗時は .bak から復元して現状維持
      if (existsSync(absPath + '.bak')) {
        copyFileSync(absPath + '.bak', absPath);
      }
    }
  }

  return { changedFiles, unregistered, errors };
}
