#!/usr/bin/env node
// Usage: node 07-confirm.js <run-dir>

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import {
  buildCommitMessage,
  rollbackBakFiles,
  cleanupBakFiles,
  commitAndPush,
} from './lib/git-ops.js';
import { promoteSnapshot, writeStatus } from './lib/run-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..'); // react_sudoku_app
const config = loadConfig();

const runDir = process.argv[2];
if (!runDir) {
  console.error('Usage: 07-confirm.js <run-dir>');
  process.exit(1);
}

const changed = JSON.parse(
  fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf-8')
);
const testResults = JSON.parse(
  fs.readFileSync(path.join(runDir, 'test-results.json'), 'utf-8')
);

console.log('='.repeat(60));
console.log(`  Figma Sync 実行完了 - ${path.basename(runDir)}`);
console.log('='.repeat(60));
console.log(`変更ファイル: ${changed.changedFiles.length}`);
for (const cf of changed.changedFiles) console.log(`  - ${cf.file}`);
if (changed.unregistered.length) {
  console.log(`未登記 nodeId: ${changed.unregistered.length}`);
  for (const n of changed.unregistered) console.log(`  ⚠ ${n}`);
}
const totalFail =
  (testResults.vitest?.failed || 0) + (testResults.jest?.failed || 0);
console.log(`\nテスト結果: ${totalFail === 0 ? '全 PASS' : `${totalFail} FAIL`}`);
console.log(
  `カバレッジ: line ${(testResults.coverage?.line || 0).toFixed(1)}%, branch ${(testResults.coverage?.branch || 0).toFixed(1)}%`
);
console.log(`\nレポート: ${path.join(runDir, 'report.xlsx')}`);
console.log(`スクリーンショット: ${path.join(runDir, 'screenshots')}`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.question('\n承認しますか？ [y/n]: ', async (ans) => {
  rl.close();
  if (ans.trim().toLowerCase() === 'y') {
    cleanupBakFiles(changed.changedFiles, REPO_ROOT);
    promoteSnapshot(path.join(ROOT, 'snapshots'));
    writeStatus(runDir, 'APPROVED');

    const filesToAdd = changed.changedFiles.map((cf) => cf.file);
    const message = buildCommitMessage({
      changedFiles: changed.changedFiles,
      reportPath: path.relative(REPO_ROOT, path.join(runDir, 'report.xlsx')),
    });
    try {
      const branch = await commitAndPush(REPO_ROOT, message, filesToAdd);
      console.log(
        `✔ Committed to ${branch} (push disabled — run 'git push' manually)`
      );
    } catch (e) {
      console.error(`commit 失敗: ${e.message}`);
      process.exit(1);
    }
  } else {
    rollbackBakFiles(changed.changedFiles, REPO_ROOT);
    const curDump = path.join(ROOT, 'snapshots', 'current', 'dump.json');
    if (fs.existsSync(curDump)) fs.rmSync(curDump);
    writeStatus(runDir, 'REJECTED');
    console.log('✗ 拒否されました、コードを元に戻しました');
  }
});
