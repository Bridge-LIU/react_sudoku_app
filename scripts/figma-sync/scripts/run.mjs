#!/usr/bin/env node
/**
 * figma-sync top-level runner
 *
 * SKILL.md から呼ばれる本体。Claude Code が MCP tool を叩いて JSON ファイルに
 * 保存し、そのパスを --*-file 引数で渡す。runner が Phase 順に script 関数を
 * 実行し、state/snapshot/runs/<ts>/status.txt を書き出す。
 *
 * Usage:
 *   node scripts/run.mjs --head-file <path> [--diff-file <path>] [--tree-file <path>]
 *
 * Return codes:
 *   0 = 成功（NO_CHANGE / INITIAL / CHANGED after successful detect+diff+detail）
 *   2 = 追加 MCP データが必要（stderr に「fetch what」ヒント）
 *   1 = 実装エラー
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, loadState, saveState, loadSnapshot, saveSnapshot } from './lib/config.mjs';
import { detect } from './01-detect.mjs';
import { runDiff } from './02-diff.mjs';
import { runFallback } from './03-fallback.mjs';
import { fetchDetail } from './04-detail.mjs';
import { applyChanges } from './05-apply.mjs';
import { takeScreenshots } from './06-screenshot.mjs';
import { runTests } from './07-test.mjs';
import { generateReport } from './08-report.mjs';

// ── CLI 引数パース ──
function parseArgs(argv) {
  const args = {
    headFile: null, diffFile: null, treeFile: null, jsxFile: null,
    dryRun: false, confirm: null, noCommit: false,
    skipTests: true, skipReport: false, skipScreenshot: true
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--head-file') args.headFile = argv[++i];
    else if (arg === '--diff-file') args.diffFile = argv[++i];
    else if (arg === '--tree-file') args.treeFile = argv[++i];
    else if (arg === '--jsx-file') args.jsxFile = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];  // yes | no
    else if (arg === '--no-commit') args.noCommit = true;
    else if (arg === '--run-tests') args.skipTests = false;
    else if (arg === '--skip-report') args.skipReport = true;
    else if (arg === '--run-screenshot') args.skipScreenshot = false;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/run.mjs --head-file <path> [--diff-file <path>] [--tree-file <path>] [--jsx-file <path>] [--confirm yes|no] [--no-commit] [--dry-run]`);
      console.log(`
--jsx-file <path>: Phase 3 用 mock get_design_context データ。JSON形式 { "<nodeId>": "<jsx string>", ... }
--confirm yes|no: Phase 7 の y/n 判定を CLI から指定（stdin プロンプト回避）
--no-commit: Phase 8 の git commit を skip（テスト用、state 更新は実行）
--run-tests: Phase 5 (npm test / e2e / audit) を実行（デフォルトは skip、時間かかる）
--skip-report: Phase 6 (Excel 報告書) を skip（デフォルトは実行、Python + openpyxl 必要）
--run-screenshot: Phase 4 (Playwright screenshot) を実行（デフォルトは skip、dev server 事前起動必要、現状 簡易版）
--dry-run: state/snapshot/file 全て書き換えない`);
      process.exit(0);
    }
  }
  return args;
}

function loadJsonFile(path, label) {
  if (!path) return null;
  if (!existsSync(path)) {
    console.error(`❌ ${label}: file not found: ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function ensureRunsDir(syncRoot) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const runsDir = join(syncRoot, 'runs', ts);
  mkdirSync(runsDir, { recursive: true });
  return { ts, runsDir };
}

function writeStatus(runsDir, status, details = {}) {
  writeFileSync(join(runsDir, 'status.txt'), status + '\n', 'utf-8');
  if (Object.keys(details).length > 0) {
    writeFileSync(join(runsDir, 'result.json'), JSON.stringify(details, null, 2), 'utf-8');
  }
}

function needMore(runsDir, need, reason) {
  console.error(`\n⚠️ 追加 MCP データが必要: ${need}`);
  console.error(`   理由: ${reason}`);
  writeStatus(runsDir, 'NEED_MORE_DATA', { need, reason });
  process.exit(2);
}

// ── main ──
async function main() {
  const args = parseArgs(process.argv);
  if (!args.headFile) {
    console.error('❌ --head-file (figma_get_file_versions response JSON) は必須');
    process.exit(1);
  }

  const SYNC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
  const REACT_APP_ROOT = dirname(dirname(SYNC_ROOT));  // .../react_sudoku_app
  const CONFIG_PATH = join(SYNC_ROOT, 'config.json');
  const STATE_PATH = join(SYNC_ROOT, '.figma-sync-state.json');
  const SNAPSHOT_PATH = join(SYNC_ROOT, 'snapshots/last-full.json');

  const config = loadConfig(CONFIG_PATH);
  // Override reactAppRoot to absolute path (config value is a bare name, not a resolved path)
  config.reactAppRoot = REACT_APP_ROOT;
  const state = loadState(STATE_PATH);
  const { ts, runsDir } = ensureRunsDir(SYNC_ROOT);

  console.log(`=== figma-sync run @ ${ts} ===`);
  console.log(`config.figmaFileUrl: ${config.figmaFileUrl}`);
  console.log(`state.last_version_id: ${state.last_version_id || '(none)'}`);
  console.log(`runsDir: ${runsDir}`);
  if (args.dryRun) console.log(`⚠️ DRY-RUN MODE — state/snapshot は書き換えない\n`);

  // ── Phase 1-a: detect ──
  const headData = loadJsonFile(args.headFile, '--head-file');
  const mcpDetect = { getFileVersions: async () => headData };
  const detectRes = await detect({ mcp: mcpDetect, state, config });
  console.log(`[Phase 1-a] status=${detectRes.status}, headVersionId=${detectRes.headVersionId || '-'}`);

  if (detectRes.status === 'FIGMA_EMPTY') {
    writeStatus(runsDir, 'FIGMA_EMPTY');
    console.error('❌ Figma file に version が無い');
    process.exit(1);
  }

  if (detectRes.status === 'NO_CHANGE') {
    // last_run_at だけ更新
    if (!args.dryRun) saveState(STATE_PATH, { ...state, last_run_at: new Date().toISOString() });
    writeStatus(runsDir, 'NO_CHANGE', { headVersionId: detectRes.headVersionId });
    console.log(`\n✅ NO_CHANGE — head 未変化、早期終了（MCP call 1）`);
    process.exit(0);
  }

  // ── Phase 1-b: diff ──
  const isInitial = detectRes.status === 'NO_STATE';

  if (isInitial) {
    // NO_STATE は diff 出来ない → 直接 fallback
    console.log(`[Phase 1-b] SKIP — NO_STATE のため diff 実行不可、fallback に進む`);
  } else {
    // CHANGED → diff 実行
    if (!args.diffFile) {
      needMore(runsDir, 'figma_diff_versions',
        `state=${state.last_version_id} → head=${detectRes.headVersionId} の diff。--diff-file で渡す`);
    }
    const diffData = loadJsonFile(args.diffFile, '--diff-file');
    const mcpDiff = { diffVersions: async () => diffData };
    const diffRes = await runDiff({
      mcp: mcpDiff, config,
      fromVersion: state.last_version_id,
      toVersion: detectRes.headVersionId
    });
    console.log(`[Phase 1-b] NodeDiffs.length=${diffRes.nodeDiffs.length}, warnings=${diffRes.warnings.length}`);
    if (diffRes.warnings.length > 0) console.log(`             ⚠️ ${diffRes.warnings.join(' / ')}`);
    writeFileSync(join(runsDir, 'diff.json'), JSON.stringify(diffRes.nodeDiffs, null, 2), 'utf-8');

    if (diffRes.nodeDiffs.length > 0) {
      // Phase 1-c: detail
      if (!args.treeFile) {
        needMore(runsDir, `figma_get_file_at_version(node_ids=[${diffRes.nodeDiffs.map(d => d.nodeId).join(',')}])`,
          `Phase 1-c 用に変更 node の詳細取得。--tree-file で渡す`);
      }
      const treeData = loadJsonFile(args.treeFile, '--tree-file');
      const mcpDetail = { getFileAtVersion: async () => treeData };
      const detailRes = await fetchDetail({
        mcp: mcpDetail, config,
        headVersionId: detectRes.headVersionId,
        nodeDiffs: diffRes.nodeDiffs
      });
      console.log(`[Phase 1-c] 詳細取得 nodes=${Object.keys(detailRes.nodes || {}).length}`);
      writeFileSync(join(runsDir, 'detail.json'), JSON.stringify(detailRes.nodes, null, 2), 'utf-8');

      await runPhases3to9({
        args, config, runsDir, state,
        headVersionId: detectRes.headVersionId,
        nodeDiffs: diffRes.nodeDiffs,
        fallbackTriggered: false,
        newSnapshot: null,
        statePath: STATE_PATH, snapshotPath: SNAPSHOT_PATH
      });
      process.exit(0);
    }
    // diff 空 → fallback へ
    console.log(`[Phase 1-b] NodeDiffs 空 → fallback に進む`);
  }

  // ── Phase 1-b-fallback ──
  if (!args.treeFile) {
    needMore(runsDir, 'figma_get_file_at_version(depth=3, node_ids=[frames])',
      `${isInitial ? '初回起動' : 'diff 空'} のため fallback で全 tree 取得が必要。--tree-file で渡す`);
  }
  const treeData = loadJsonFile(args.treeFile, '--tree-file');
  const mcpFallback = { getFileAtVersion: async () => treeData };
  const previousSnapshot = loadSnapshot(SNAPSHOT_PATH);
  const fallbackRes = await runFallback({
    mcp: mcpFallback, config,
    headVersionId: detectRes.headVersionId,
    previousSnapshot
  });
  console.log(`[Phase 1-b-fallback] status=${fallbackRes.status}, nodeDiffs.length=${fallbackRes.nodeDiffs?.length || 0}`);

  if (fallbackRes.status === 'OVERSIZED') {
    writeStatus(runsDir, 'OVERSIZED', { sizeBytes: fallbackRes.sizeBytes, maxBytes: fallbackRes.maxBytes });
    console.error(`❌ 全 tree サイズ ${fallbackRes.sizeBytes} > ${fallbackRes.maxBytes}`);
    process.exit(1);
  }

  // fallback ログ記録
  const fallbackLog = {
    ts, reason: isInitial ? 'INITIAL_STARTUP' : 'DIFF_EMPTY',
    fromVersion: state.last_version_id || null,
    headVersionId: detectRes.headVersionId,
    fallbackStatus: fallbackRes.status,
    nodeDiffCount: fallbackRes.nodeDiffs?.length || 0
  };
  writeFileSync(join(runsDir, 'fallback.log'), JSON.stringify(fallbackLog, null, 2), 'utf-8');

  if (fallbackRes.status === 'INITIAL') {
    if (!args.dryRun) {
      saveSnapshot(SNAPSHOT_PATH, fallbackRes.newSnapshot);
      saveState(STATE_PATH, {
        last_version_id: detectRes.headVersionId,
        last_run_at: new Date().toISOString(),
        last_fallback_at: new Date().toISOString(),
        fallback_count_last_7days: 1
      });
    }
    writeStatus(runsDir, 'INITIAL_BASELINE', { headVersionId: detectRes.headVersionId });
    console.log(`\n✅ INITIAL — baseline seed 完了、Phase 3-8 スキップ`);
    process.exit(0);
  }

  if (fallbackRes.status === 'NO_CHANGE') {
    if (!args.dryRun) {
      saveState(STATE_PATH, {
        ...state,
        last_version_id: detectRes.headVersionId,
        last_run_at: new Date().toISOString()
      });
    }
    writeStatus(runsDir, 'NO_CHANGE_VIA_FALLBACK', { headVersionId: detectRes.headVersionId });
    console.log(`\n✅ NO_CHANGE — fallback で local diff 実行、真に変化なし`);
    process.exit(0);
  }

  // CHANGED via fallback
  writeFileSync(join(runsDir, 'diff.json'), JSON.stringify(fallbackRes.nodeDiffs, null, 2), 'utf-8');
  console.log(`   検出変更: ${fallbackRes.nodeDiffs.length} node`);
  for (const d of fallbackRes.nodeDiffs.slice(0, 5)) {
    console.log(`     - ${d.nodeId} (${d.nodeName || '?'}): ${d.kind} / props: ${(d.changedProps || []).join(', ')}`);
  }

  await runPhases3to9({
    args, config, runsDir, state,
    headVersionId: detectRes.headVersionId,
    nodeDiffs: fallbackRes.nodeDiffs,
    fallbackTriggered: true,
    newSnapshot: fallbackRes.newSnapshot,
    statePath: STATE_PATH, snapshotPath: SNAPSHOT_PATH
  });
  process.exit(0);
}

// ── Phase 3 → 7 → 8-9 統合 ──
async function runPhases3to9({
  args, config, runsDir, state,
  headVersionId, nodeDiffs, fallbackTriggered,
  newSnapshot, statePath, snapshotPath
}) {
  // Phase 3: apply
  if (!args.jsxFile) {
    needMore(runsDir, `get_design_context(node_ids=[${nodeDiffs.map(d => d.nodeId).join(',')}])`,
      `Phase 3 JSX 生成用データ。JSON形式 {"<nodeId>":"<jsx>"} を --jsx-file で渡す`);
  }
  const jsxData = loadJsonFile(args.jsxFile, '--jsx-file');
  const mcpApply = { getDesignContext: async ({ nodeId }) => ({ jsx: jsxData[nodeId] || '' }) };

  if (args.dryRun) {
    console.log(`[Phase 3] DRY-RUN: skip 実 file 書換、jsxData keys=${Object.keys(jsxData).join(',')}`);
    writeStatus(runsDir, 'DRY_RUN_STOPPED', { headVersionId, nodeDiffCount: nodeDiffs.length });
    return;
  }

  const applyRes = await applyChanges({ mcp: mcpApply, config, nodeDiffs });
  console.log(`[Phase 3] changedFiles=${applyRes.changedFiles.length}, unregistered=${applyRes.unregistered.length}, errors=${applyRes.errors.length}`);
  if (applyRes.errors.length > 0) {
    console.log('           ⚠️ apply errors:', JSON.stringify(applyRes.errors, null, 2));
  }
  writeFileSync(join(runsDir, 'apply.json'), JSON.stringify(applyRes, null, 2), 'utf-8');

  // Phase 4: screenshot
  if (args.skipScreenshot) {
    console.log(`[Phase 4] SKIP — --run-screenshot 未指定`);
  } else if (applyRes.changedFiles.length === 0) {
    console.log(`[Phase 4] SKIP — changedFiles 空`);
  } else {
    console.log(`[Phase 4] Playwright で screenshot 撮影中...（dev server 事前起動前提、現状 簡易版）`);
    try {
      const shotRes = await takeScreenshots({
        config, changedFiles: applyRes.changedFiles, runDir: runsDir
      });
      console.log(`[Phase 4] ✅ ${shotRes.screenshots.length} 枚 → ${shotRes.outDir}`);
    } catch (e) {
      console.error(`[Phase 4] ⚠️ 撮影失敗（${e.message.slice(0, 150)}）— Phase 5 は続行`);
    }
  }

  // Phase 5: tests
  let testResults = null;
  if (args.skipTests) {
    console.log(`[Phase 5] SKIP — --run-tests 未指定`);
  } else {
    console.log(`[Phase 5] npm test / e2e / audit 実行中...（時間かかる）`);
    testResults = await runTests({ config, runDir: runsDir });
    const unitPass = testResults.unit?.exitCode === 0;
    const e2ePass = testResults.e2e?.exitCode === 0;
    const auditIssues = testResults.audit?.json?.metadata?.vulnerabilities?.total ?? '?';
    const covLine = testResults.coverage?.total?.lines?.pct ?? '-';
    console.log(`[Phase 5] unit=${unitPass ? 'PASS' : 'FAIL'}, e2e=${e2ePass ? 'PASS' : 'FAIL'}, audit issues=${auditIssues}, coverage line=${covLine}%`);
    console.log(`           test-results.json → ${runsDir}/test-results.json`);
    // 注：test 失敗は Phase 7 の判定に委ねる（SPEC L286 に従い強制中断しない）
  }

  // Phase 6: Excel report
  if (args.skipReport) {
    console.log(`[Phase 6] SKIP — --skip-report 指定`);
  } else {
    console.log(`[Phase 6] Python + openpyxl で Excel 報告書生成中...`);
    const reportRes = await generateReport({ config, runDir: runsDir });
    if (reportRes.exitCode === 0) {
      console.log(`[Phase 6] ✅ 生成: ${reportRes.reportPath}`);
    } else {
      console.error(`[Phase 6] ⚠️ 生成失敗（exit=${reportRes.exitCode}）— Phase 7 は続行`);
      if (reportRes.stderr) console.error(`           stderr: ${reportRes.stderr.slice(0, 300)}`);
    }
  }

  // Phase 7: y/n
  if (args.confirm === null) {
    needMore(runsDir, `human confirmation`,
      `Phase 7 の判定が必要。--confirm yes または --confirm no を追加`);
  }
  console.log(`[Phase 7] confirm=${args.confirm}`);

  if (args.confirm === 'no') {
    // Rollback via git restore
    if (applyRes.changedFiles.length > 0) {
      const absFiles = applyRes.changedFiles.map(f => join(config.reactAppRoot, f));
      const gitRestoreRes = spawnSync('git', ['restore', '--', ...absFiles], {
        encoding: 'utf-8', cwd: config.reactAppRoot
      });
      console.log(`[Phase 9-rollback] git restore ${absFiles.length} file, status=${gitRestoreRes.status}`);
      if (gitRestoreRes.status !== 0) {
        console.error(`   ⚠️ ${gitRestoreRes.stderr}`);
      }
    }
    writeStatus(runsDir, 'REJECTED', {
      headVersionId, changedFilesRestored: applyRes.changedFiles,
      note: 'state / snapshot は更新されない、次回同じ diff で再検出可能'
    });
    console.log(`\n✅ REJECTED — .bak 不使用、git restore で rollback 済み、state は不変`);
    return;
  }

  if (args.confirm !== 'yes') {
    console.error(`❌ --confirm は 'yes' or 'no' が必要（受け取った: ${args.confirm}）`);
    writeStatus(runsDir, 'BAD_CONFIRM_ARG', { confirm: args.confirm });
    process.exit(1);
  }

  // Phase 8: commit（--no-commit なら skip）
  if (args.noCommit) {
    console.log(`[Phase 8] SKIP — --no-commit 指定、commit 実行しない`);
  } else {
    const commitMsg = [
      '機能更新: Figma 同期による UI 反映',
      '',
      ...applyRes.changedFiles.map(f => `- ${f}`),
      '',
      `Figma nodeIds: ${nodeDiffs.map(d => d.nodeId).join(', ')}`,
      `検出方式: ${fallbackTriggered ? 'figma_get_file_at_version fallback' : 'figma_diff_versions'}`,
      '',
      'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>'
    ].join('\n');
    const gitAdd = spawnSync('git', ['add', ...applyRes.changedFiles.map(f => join(config.reactAppRoot, f))], {
      encoding: 'utf-8', cwd: config.reactAppRoot
    });
    if (gitAdd.status !== 0) {
      console.error(`❌ git add failed: ${gitAdd.stderr}`);
      process.exit(1);
    }
    const gitCommit = spawnSync('git', ['commit', '-m', commitMsg], {
      encoding: 'utf-8', cwd: config.reactAppRoot
    });
    console.log(`[Phase 8] git commit status=${gitCommit.status}`);
    if (gitCommit.status !== 0) {
      console.error(`   ⚠️ ${gitCommit.stderr}`);
      writeStatus(runsDir, 'COMMIT_FAILED', { stderr: gitCommit.stderr });
      process.exit(1);
    }
  }

  // Phase 9: state 更新
  const now = new Date().toISOString();
  const newState = {
    last_version_id: headVersionId,
    last_run_at: now
  };
  if (fallbackTriggered) {
    newState.last_fallback_at = now;
    newState.fallback_count_last_7days = (state.fallback_count_last_7days || 0) + 1;
    saveSnapshot(snapshotPath, newSnapshot);
  }
  saveState(statePath, newState);
  writeStatus(runsDir, 'APPROVED', {
    headVersionId, committed: !args.noCommit,
    changedFiles: applyRes.changedFiles
  });
  console.log(`\n✅ APPROVED — state 更新完了${args.noCommit ? '（commit skip）' : '（commit 済み）'}`);
}

main().catch(e => {
  console.error('❌ Runner error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
