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
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, loadState, saveState, loadSnapshot, saveSnapshot } from './lib/config.mjs';
import { detect } from './01-detect.mjs';
import { runDiff } from './02-diff.mjs';
import { runFallback } from './03-fallback.mjs';
import { fetchDetail } from './04-detail.mjs';
import { applyChanges, resolveToRegisteredFrame } from './05-apply.mjs';
import { takeScreenshots, generateDiff } from './06-screenshot.mjs';
import { runTests } from './07-test.mjs';
import { generateReport } from './08-report.mjs';
import { startSilentDevServer, stopSilentDevServer } from './lib/dev-server.mjs';

// ── CLI 引数パース ──
function parseArgs(argv) {
  const args = {
    headFile: null, diffFile: null, treeFile: null, jsxFile: null, variablesFile: null,
    dryRun: false, confirm: null, noCommit: false,
    skipTests: true, skipReport: false, skipScreenshot: false
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--head-file') args.headFile = argv[++i];
    else if (arg === '--diff-file') args.diffFile = argv[++i];
    else if (arg === '--tree-file') args.treeFile = argv[++i];
    else if (arg === '--jsx-file') args.jsxFile = argv[++i];
    else if (arg === '--variables-file') args.variablesFile = argv[++i];
    else if (arg === '--confirm') args.confirm = argv[++i];  // yes | no
    else if (arg === '--no-commit') args.noCommit = true;
    else if (arg === '--run-tests') args.skipTests = false;
    else if (arg === '--skip-report') args.skipReport = true;
    else if (arg === '--run-screenshot') args.skipScreenshot = false;    // 後方互換
    else if (arg === '--no-screenshot') args.skipScreenshot = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/run.mjs --head-file <path> [--diff-file <path>] [--tree-file <path>] [--jsx-file <path>] [--variables-file <path>] [--confirm yes|no] [--no-commit] [--dry-run]`);
      console.log(`
--jsx-file <path>: Phase 3 用 mock get_design_context データ。JSON形式 { "<nodeId>": "<jsx string>", ... }
--variables-file <path>: figma_get_variables の生 JSON (VariableID → 変数名/値 の解決用)。省略時は Excel が raw ID + '(未解決)' で表示
--confirm yes|no: Phase 7 の y/n 判定を CLI から指定（stdin プロンプト回避）
--no-commit: Phase 8 の git commit を skip（テスト用、state 更新は実行）
--run-tests: Phase 5 (npm test / e2e / audit) を実行（デフォルトは skip、時間かかる）
--skip-report: Phase 6 (Excel 報告書) を skip（デフォルトは実行、Python + openpyxl 必要）
--run-screenshot: 後方互換フラグ（Phase 4 はデフォルトで実行）
--no-screenshot: Phase 4 (Playwright screenshot) を skip。デフォルトは実行、runner が dev server を windowsHide で自動起動/停止
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

  // variables.json は Phase 6 (Excel report) で VariableID → 変数名/値 解決に使う。
  // 指定あれば即 runsDir にコピー（Phase 6 の 06-report.py が runDir/variables.json を読む）。
  if (args.variablesFile) {
    if (!existsSync(args.variablesFile)) {
      console.error(`❌ --variables-file: file not found: ${args.variablesFile}`);
      process.exit(1);
    }
    copyFileSync(args.variablesFile, join(runsDir, 'variables.json'));
    console.log(`variables.json copied → ${runsDir}/variables.json`);
  }

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

  // ── nodeDiffs → 登記済 frame nodeId の解決（Phase 4 before/after 用） ──
  // Phase 3 apply の resolveToRegisteredFrame と同じ考え方。ここで先に計算し、
  // before/after 両 phase で同じ配列を使う（Phase 3 で file が変わっても frame は変わらない）。
  const changedFrameIds = resolveChangedFrameIds({
    config, nodeDiffs, snapshot: fallbackTriggered ? newSnapshot : undefined
  });
  console.log(`[Phase 3-pre] resolved frame nodeIds for screenshot: [${changedFrameIds.join(', ') || '(none)'}]`);

  // Phase 4-before: apply の前に現状 UI を撮る
  //   静默 dev server を runner が管理する。既存 server がいれば reuse し kill しない
  let beforeShotRes = null;
  let devServerHandle = null;
  const shouldShoot = !args.skipScreenshot && changedFrameIds.length > 0;
  if (shouldShoot) {
    const devLogPath = join(runsDir, 'dev-server.log');
    console.log(`[Phase 4-pre] dev server 静默起動中...（log=${devLogPath}）`);
    try {
      devServerHandle = await startSilentDevServer({ config, logPath: devLogPath });
      console.log(`[Phase 4-pre] dev server ready (reused=${devServerHandle.reused}, pid=${devServerHandle.pid || '-'})`);
    } catch (e) {
      console.error(`[Phase 4-pre] ⚠️ dev server 起動失敗（${e.message.slice(0, 200)}）— screenshot skip、apply は続行`);
      devServerHandle = null;
    }

    if (devServerHandle) {
      console.log(`[Phase 4-before] Playwright で apply 前の screenshot 撮影中...`);
      try {
        beforeShotRes = await takeScreenshots({
          config, runDir: runsDir, phase: 'before', changedFrameIds
        });
        const took = beforeShotRes.screenshots.filter(s => s.before).length;
        const skipped = beforeShotRes.screenshots.filter(s => s.skipped).length;
        console.log(`[Phase 4-before] ✅ 撮影 ${took} / skip ${skipped} → ${beforeShotRes.outDir}`);
      } catch (e) {
        console.error(`[Phase 4-before] ⚠️ 撮影失敗（${e.message.slice(0, 150)}）— apply は続行`);
      }
    }
  } else if (args.skipScreenshot) {
    console.log(`[Phase 4-before] SKIP — --no-screenshot 指定`);
  } else {
    console.log(`[Phase 4-before] SKIP — changedFrameIds 空`);
  }

  // fallback 経由の場合は snapshot を渡し、descendant nodeId → 登記 frame の解決を有効化
  const applyRes = await applyChanges({
    mcp: mcpApply, config, nodeDiffs,
    snapshot: fallbackTriggered ? newSnapshot : undefined
  });
  console.log(`[Phase 3] changedFiles=${applyRes.changedFiles.length}, unregistered=${applyRes.unregistered.length}, errors=${applyRes.errors.length}`);
  if (applyRes.errors.length > 0) {
    console.log('           ⚠️ apply errors:', JSON.stringify(applyRes.errors, null, 2));
  }
  writeFileSync(join(runsDir, 'apply.json'), JSON.stringify(applyRes, null, 2), 'utf-8');

  // Phase 4-after: apply の後 & diff 生成
  let afterShotRes = null;
  const diffResults = new Map();  // component -> {diffPixels, diffPath}
  if (args.skipScreenshot) {
    console.log(`[Phase 4-after] SKIP — --no-screenshot 指定`);
  } else if (!devServerHandle) {
    console.log(`[Phase 4-after] SKIP — dev server が上がっていない`);
  } else if (applyRes.changedFiles.length === 0) {
    console.log(`[Phase 4-after] SKIP — changedFiles 空`);
  } else if (changedFrameIds.length === 0) {
    console.log(`[Phase 4-after] SKIP — changedFrameIds 空`);
  } else {
    console.log(`[Phase 4-after] Playwright で apply 後の screenshot 撮影中...`);
    try {
      afterShotRes = await takeScreenshots({
        config, runDir: runsDir, phase: 'after', changedFrameIds
      });
      const took = afterShotRes.screenshots.filter(s => s.after).length;
      console.log(`[Phase 4-after] ✅ 撮影 ${took} 枚`);

      // pixelmatch diff 生成
      for (const shot of afterShotRes.screenshots) {
        if (shot.before && shot.after) {
          const diffPath = join(afterShotRes.outDir, `${shot.component}_diff.png`);
          try {
            const { diffPixels } = generateDiff({
              beforePath: shot.before, afterPath: shot.after, diffPath,
              threshold: config.pixelmatchThreshold ?? 0.1
            });
            diffResults.set(shot.component, { diffPixels, diffPath });
            console.log(`             diff ${shot.component}: ${diffPixels} px`);
          } catch (e) {
            console.error(`             ⚠️ diff ${shot.component} failed: ${e.message.slice(0, 120)}`);
          }
        }
      }
    } catch (e) {
      console.error(`[Phase 4-after] ⚠️ 撮影失敗（${e.message.slice(0, 150)}）— Phase 5 は続行`);
    }
  }

  // dev server の後始末：runner が起動したものだけ止める（reused は他セッションに委ねる）
  if (devServerHandle && !devServerHandle.reused) {
    const stopRes = stopSilentDevServer(devServerHandle);
    console.log(`[Phase 4-post] dev server stop: killed=${stopRes.killed}, status=${stopRes.status ?? '-'}`);
  } else if (devServerHandle?.reused) {
    console.log(`[Phase 4-post] dev server reuse — kill せず（既存 session を守る）`);
  }

  // ── design_changes.json 書き出し（Phase 6 Excel から参照） ──
  const designChanges = buildDesignChanges({
    config, nodeDiffs, changedFrameIds,
    beforeShotRes, afterShotRes, diffResults, runsDir
  });
  writeFileSync(
    join(runsDir, 'design_changes.json'),
    JSON.stringify(designChanges, null, 2), 'utf-8'
  );
  console.log(`[Phase 4-report] design_changes.json 書き出し（entries=${designChanges.length}）`);

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

/**
 * nodeDiffs から config.frames に登記されている frame nodeId を解決。
 * - 直接登記 nodeId は即マッチ
 * - snapshot があれば descendant → 祖先 frame を解決（05-apply の resolveToRegisteredFrame 流用）
 * - 重複除去
 */
function resolveChangedFrameIds({ config, nodeDiffs, snapshot }) {
  const frameById = new Map((config.frames || []).map(f => [f.nodeId, f]));
  const hits = new Set();
  for (const d of nodeDiffs || []) {
    if (!d || !d.nodeId) continue;
    if (frameById.has(d.nodeId)) {
      hits.add(d.nodeId);
      continue;
    }
    if (snapshot) {
      const frame = resolveToRegisteredFrame(d.nodeId, snapshot, frameById);
      if (frame) hits.add(frame.nodeId);
    }
  }
  return Array.from(hits);
}

/**
 * Phase 6 (Excel) に渡す design_changes[] を組み立てる。
 * screenshot が撮れなかった frame（route=null や失敗）は before/after/diff=null。
 * changes には対応する nodeDiff の生データを配列で入れる（同一 frame に複数 diff が集まる場合あり）。
 */
function buildDesignChanges({
  config, nodeDiffs, changedFrameIds,
  beforeShotRes, afterShotRes, diffResults, runsDir
}) {
  const frameById = new Map((config.frames || []).map(f => [f.nodeId, f]));
  const shotByComponent = new Map();  // component -> merged shot info
  for (const rs of [beforeShotRes, afterShotRes]) {
    if (!rs) continue;
    for (const s of rs.screenshots) {
      const existing = shotByComponent.get(s.component) || {};
      shotByComponent.set(s.component, {
        before: s.before || existing.before || null,
        after:  s.after  || existing.after  || null
      });
    }
  }

  // frame ごとに関連 diff を集約
  const diffsByFrame = new Map();
  for (const d of nodeDiffs || []) {
    let frameId = null;
    if (frameById.has(d.nodeId)) {
      frameId = d.nodeId;
    } else {
      // 05-apply の resolveToRegisteredFrame は snapshot 必要。ここは既に解決済み
      // の changedFrameIds を軸に、diff.nodeId が hit しないものは skip する。
      continue;
    }
    if (!diffsByFrame.has(frameId)) diffsByFrame.set(frameId, []);
    diffsByFrame.get(frameId).push(d);
  }
  // 直接 hit しなかった diff は「不明」なので、changedFrameIds に含まれる各 frame の
  // changes として、直接 hit した diff だけを載せる（過剰包含を避ける）。

  const results = [];
  for (const frameId of changedFrameIds) {
    const frame = frameById.get(frameId);
    if (!frame) continue;
    const shot = shotByComponent.get(frame.component) || {};
    const diffMeta = diffResults.get(frame.component);
    // pathを runsDir 相対に変換（Excel から参照しやすいように）
    const rel = (p) => {
      if (!p) return null;
      const idx = p.indexOf('screenshots');
      return idx >= 0 ? p.slice(idx).replace(/\\/g, '/') : p;
    };
    results.push({
      component: frame.component,
      file: frame.file,
      node_id: frameId,
      changes: diffsByFrame.get(frameId) || [],
      before_png: rel(shot.before),
      after_png: rel(shot.after),
      diff_png: diffMeta ? rel(diffMeta.diffPath) : null,
      diff_pixels: diffMeta ? diffMeta.diffPixels : null
    });
  }
  return results;
}

main().catch(e => {
  console.error('❌ Runner error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
