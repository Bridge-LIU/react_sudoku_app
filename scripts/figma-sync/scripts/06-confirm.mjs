import { writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveState, saveSnapshot } from './lib/config.mjs';
import { readIndex, writeIndex } from './lib/snapshot.mjs';
import readline from 'node:readline/promises';

/**
 * Phase 7-9: 人確認 → rollback or commit/PR → state 更新
 */
export async function confirmAndCommit({
  config, runDir,
  headVersionId, changedFiles, unregistered, testResults, nodeDiffs, fallbackTriggered,
  newSnapshot,
  statePath, snapshotPath
}) {
  // Phase 7: 人確認
  const summary = buildSummary({ changedFiles, testResults, nodeDiffs, fallbackTriggered, runDir });
  console.log(summary);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question('承認しますか？ [y/n]: ');
  rl.close();

  if (ans.trim().toLowerCase() !== 'y') {
    // Rollback: git restore で React コード復元（.bak 不要、git 管理下のため）
    if (changedFiles.length > 0) {
      const absFiles = changedFiles.map(f => join(config.reactAppRoot, f));
      const gitRestoreRes = spawnSync('git', ['restore', '--', ...absFiles], { encoding: 'utf-8', shell: true });
      if (gitRestoreRes.status !== 0) {
        console.error(`git restore failed: ${gitRestoreRes.stderr}`);
      }
    }
    writeFileSync(join(runDir, 'status.txt'), 'REJECTED');
    return { status: 'REJECTED' };
  }

  // Phase 8: commit
  writeFileSync(join(runDir, 'status.txt'), 'APPROVED');

  const detectMethod = fallbackTriggered ? 'figma_get_file_at_version fallback' : 'figma_diff_versions';
  const commitMsg = [
    '機能更新: Figma 同期による UI 反映',
    '',
    ...changedFiles.map(f => `- ${f}`),
    '',
    `Figma nodeIds: ${nodeDiffs.map(d => d.nodeId).join(', ')}`,
    `検出方式: ${detectMethod}`,
    `Report: ${join(runDir, 'report.xlsx')}`,
    '',
    'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>'
  ].join('\n');

  const gitAddRes = spawnSync('git', ['add', ...changedFiles.map(f => join(config.reactAppRoot, f))], { encoding: 'utf-8', shell: true });
  if (gitAddRes.status !== 0) throw new Error(`git add failed: ${gitAddRes.stderr}`);

  const gitCommitRes = spawnSync('git', ['commit', '-m', commitMsg], { encoding: 'utf-8', shell: true });
  if (gitCommitRes.status !== 0) {
    return { status: 'COMMIT_FAILED', stderr: gitCommitRes.stderr };
  }

  // Phase 9: state 更新
  const now = new Date().toISOString();
  const state = {
    last_version_id: headVersionId,
    last_run_at: now
  };
  if (fallbackTriggered) {
    state.last_fallback_at = now;
    state.fallback_count_last_7days = countRecentFallbacks(config.reactAppRoot);
    saveSnapshot(snapshotPath, newSnapshot);
  }
  saveState(statePath, state);

  return { status: 'APPROVED', commitMsg };
}

function buildSummary({ changedFiles, testResults, nodeDiffs, fallbackTriggered, runDir }) {
  const lines = [
    '='.repeat(60),
    `  Figma Sync 実行完了 - ${new Date().toISOString()}`,
    '='.repeat(60)
  ];
  if (fallbackTriggered) {
    lines.push('⚠️ FALLBACK TRIGGERED（raw property 変更検知）');
  }
  lines.push('', `変更ファイル：${changedFiles.length}`);
  changedFiles.forEach(f => lines.push(`  - ${f}`));
  lines.push('', `NodeDiff：${nodeDiffs.length} 件`);
  lines.push('', `テスト結果：${testResults?.unit?.exitCode === 0 ? 'PASS' : 'FAIL'}`);
  lines.push('', `レポート：${join(runDir, 'report.xlsx')}`);
  lines.push('スクリーンショット：' + join(runDir, 'screenshots'));
  lines.push('');
  return lines.join('\n');
}

function countRecentFallbacks(reactAppRoot) {
  // 過去 7 日以内の runs/<ts>/fallback.log の件数を数える簡易実装
  // 実装本体で精度アップ想定
  return 1;
}

/**
 * Promote candidate snapshots to permanent snapshots/ after successful commit.
 * Task 9's runner calls this in the APPROVED branch, never on REJECTED.
 *
 * @param {object} params
 * @param {string} params.syncRoot - .../react_sudoku_app/scripts/figma-sync
 * @param {string} params.headVersionId
 * @param {Array<{nodeId:string, jsonHash:string, pngHash:string|null}>} params.changedFrames
 */
export function promoteCandidateSnapshots({ syncRoot, headVersionId, changedFrames }) {
  const snapDir = join(syncRoot, 'snapshots');
  const candidateDir = join(syncRoot, '_tmp', 'candidate');
  const idx = readIndex(snapDir);
  for (const f of changedFrames) {
    const safe = f.nodeId.replace(/:/g, '-');
    const jsonSrc = join(candidateDir, `${safe}.json`);
    const pngSrc  = join(candidateDir, `${safe}.png`);
    if (existsSync(jsonSrc)) copyFileSync(jsonSrc, join(snapDir, `${safe}.json`));
    if (existsSync(pngSrc))  copyFileSync(pngSrc,  join(snapDir, `${safe}.png`));
    idx.frames[f.nodeId] = {
      json_hash: f.jsonHash,
      png_hash:  f.pngHash,
      taken_at:  new Date().toISOString(),
      version_id: headVersionId
    };
  }
  writeIndex(snapDir, idx);
}
