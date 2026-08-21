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
import { loadConfig, loadState, saveState, loadSnapshot, saveSnapshot } from './lib/config.mjs';
import { detect } from './01-detect.mjs';
import { runDiff } from './02-diff.mjs';
import { runFallback } from './03-fallback.mjs';
import { fetchDetail } from './04-detail.mjs';

// ── CLI 引数パース ──
function parseArgs(argv) {
  const args = { headFile: null, diffFile: null, treeFile: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--head-file') args.headFile = argv[++i];
    else if (arg === '--diff-file') args.diffFile = argv[++i];
    else if (arg === '--tree-file') args.treeFile = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/run.mjs --head-file <path> [--diff-file <path>] [--tree-file <path>] [--dry-run]`);
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
  const CONFIG_PATH = join(SYNC_ROOT, 'config.json');
  const STATE_PATH = join(SYNC_ROOT, '.figma-sync-state.json');
  const SNAPSHOT_PATH = join(SYNC_ROOT, 'snapshots/last-full.json');

  const config = loadConfig(CONFIG_PATH);
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

      writeStatus(runsDir, 'CHANGED_READY_FOR_APPLY', {
        headVersionId: detectRes.headVersionId,
        nodeDiffs: diffRes.nodeDiffs
      });
      console.log(`\n🟡 CHANGED — Phase 3-9 未実装のため、ここで停止（Task 16 Step 5 の前提）`);
      console.log(`   次: Phase 3 apply → 4 screenshot → 5 test → 6 report → 7 y/n → 8 commit → 9 state 更新`);
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
  if (!args.dryRun) {
    saveSnapshot(SNAPSHOT_PATH, fallbackRes.newSnapshot);
    // state 更新は Phase 9 (commit 後) の役割、ここではまだ更新しない
  }
  writeFileSync(join(runsDir, 'diff.json'), JSON.stringify(fallbackRes.nodeDiffs, null, 2), 'utf-8');
  writeStatus(runsDir, 'CHANGED_VIA_FALLBACK_READY_FOR_APPLY', {
    headVersionId: detectRes.headVersionId,
    nodeDiffCount: fallbackRes.nodeDiffs.length,
    firstNodeDiff: fallbackRes.nodeDiffs[0]
  });
  console.log(`\n🟡 CHANGED (via fallback) — Phase 3-9 未実装のため、ここで停止（Task 16 Step 5 の前提）`);
  console.log(`   検出変更: ${fallbackRes.nodeDiffs.length} node`);
  for (const d of fallbackRes.nodeDiffs.slice(0, 5)) {
    console.log(`     - ${d.nodeId} (${d.nodeName || '?'}): ${d.kind} / props: ${(d.changedProps || []).join(', ')}`);
  }
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Runner error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
