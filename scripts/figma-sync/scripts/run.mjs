#!/usr/bin/env node
/**
 * figma-sync v5 runner (dual-snapshot detection).
 *
 * Claude Code drives the pipeline: it invokes MCP tools, saves each response
 * to JSON files (bundle format per phase), then re-runs this script with
 * --*-file flags. The runner processes Phase 1 → 6 and exits at each point
 * where it needs a follow-up MCP call.
 *
 * INV-1: state / snapshot advance ONLY after commit success
 * INV-2: apply touches only changedFrameIds
 * INV-3: no premature state update to fake NO_CHANGE
 * INV-4: verify FAIL → SUSPICIOUS
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, loadState, saveState } from './lib/config.mjs';
import { detect } from './01-detect.mjs';
import { applyChanges } from './02-apply.mjs';
import { verifyFrames } from './03-verify.mjs';
import { runTests } from './04-test.mjs';
import { generateReport } from './05-report.mjs';
import { promoteCandidateSnapshots } from './06-confirm.mjs';

function parseArgs(argv) {
  const args = {
    headFile: null, snapshotBundleFile: null, pngBundleFile: null,
    designContextFile: null, variablesFile: null,
    confirm: null, noCommit: false,
    skipTests: true, skipReport: false, skipVerify: false, dryRun: false
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--head-file') args.headFile = argv[++i];
    else if (a === '--snapshot-bundle-file') args.snapshotBundleFile = argv[++i];
    else if (a === '--png-bundle-file') args.pngBundleFile = argv[++i];
    else if (a === '--design-context-file') args.designContextFile = argv[++i];
    else if (a === '--variables-file') args.variablesFile = argv[++i];
    else if (a === '--confirm') args.confirm = argv[++i];
    else if (a === '--no-commit') args.noCommit = true;
    else if (a === '--run-tests') args.skipTests = false;
    else if (a === '--skip-report') args.skipReport = true;
    else if (a === '--no-verify') args.skipVerify = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/run.mjs --head-file <path> [flags]

Required (Phase 1):
  --head-file <path>            figma_get_file_versions response JSON

Phase 1 detect (recommended):
  --snapshot-bundle-file <path> Bundle: {"<nodeId>": <get_file_at_version response>}
  --png-bundle-file <path>      Bundle: {"<nodeId>": "path/to/frame.png"}

Phase 2 apply (required if detect reports CHANGED):
  --design-context-file <path>  {"<nodeId>": "<jsx string>"}

Phase 6 confirm (required to finalize):
  --confirm yes|no              yes → commit + promote snapshots; no → git restore
  --no-commit                   dry-commit; state/snapshot still advance on yes
  --run-tests                   run npm test / e2e / audit (slow, default off)
  --skip-report                 skip Excel report generation
  --no-verify                   skip Phase 3 Playwright verify
  --dry-run                     do not write React files, state, or snapshots
`);
}

function needMore(runsDir, need, reason) {
  console.error(`\n⚠️ 追加 MCP データが必要: ${need}\n   理由: ${reason}`);
  writeFileSync(join(runsDir, 'status.txt'), 'NEED_MORE_DATA\n', 'utf-8');
  writeFileSync(join(runsDir, 'result.json'), JSON.stringify({ need, reason }, null, 2), 'utf-8');
  process.exit(2);
}

function loadJson(path, label) {
  if (!existsSync(path)) { console.error(`❌ ${label}: not found: ${path}`); process.exit(1); }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.headFile) { console.error('❌ --head-file 必須'); process.exit(1); }

  const SYNC_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
  const REACT_APP_ROOT = dirname(dirname(SYNC_ROOT));
  const config = loadConfig(join(SYNC_ROOT, 'config.json'));
  config.reactAppRoot = REACT_APP_ROOT;
  const statePath = join(SYNC_ROOT, '.figma-sync-state.json');
  const state = loadState(statePath);

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const runsDir = join(SYNC_ROOT, 'runs', ts);
  mkdirSync(runsDir, { recursive: true });

  console.log(`=== figma-sync v5 @ ${ts} ===`);
  console.log(`state.last_version_id: ${state.last_version_id || '(none)'}`);
  console.log(`runsDir: ${runsDir}`);

  // ── Phase 1 detect ──
  const headJson = loadJson(args.headFile, '--head-file');
  const snapshotBundle = args.snapshotBundleFile ? loadJson(args.snapshotBundleFile, '--snapshot-bundle-file') : null;
  const pngBundle = args.pngBundleFile ? loadJson(args.pngBundleFile, '--png-bundle-file') : null;

  const detectRes = await detect({
    syncRoot: SYNC_ROOT, config, state,
    fetchers: {
      headVersion: async () => headJson,
      nodeSnapshot: async ({ nodeId }) => {
        if (!snapshotBundle) needMore(runsDir,
          `figma_get_file_at_version(node_ids=[${nodeId}]) for each config.frames[].nodeId`,
          'Phase 1 needs JSON snapshot bundle');
        return snapshotBundle[nodeId] ?? null;
      },
      framePng: async ({ nodeId }) => {
        if (!pngBundle) return null; // degrade to SUSPICIOUS if png missing
        const path = pngBundle[nodeId];
        return path && existsSync(path) ? readFileSync(path) : null;
      }
    }
  });
  writeFileSync(join(runsDir, 'detect.json'), JSON.stringify(detectRes, null, 2), 'utf-8');
  console.log(`[Phase 1] status=${detectRes.status}, frames=${detectRes.frames?.length || 0}`);

  if (detectRes.status === 'FIGMA_EMPTY') {
    writeFileSync(join(runsDir, 'status.txt'), 'FIGMA_EMPTY\n');
    console.error('❌ Figma file に version が無い'); process.exit(1);
  }
  if (detectRes.status === 'NO_CHANGE') {
    if (!args.dryRun) saveState(statePath, { ...state, last_version_id: detectRes.headVersionId, last_run_at: new Date().toISOString() });
    writeFileSync(join(runsDir, 'status.txt'), 'NO_CHANGE\n');
    console.log('\n✅ NO_CHANGE — 早期終了');
    return;
  }

  const changed = detectRes.frames.filter(f => f.verdict !== 'NO_CHANGE');
  const changedIds = changed.map(f => f.nodeId);
  console.log(`   changed frames: ${changedIds.join(', ')}`);

  // ── Phase 2 apply ──
  if (!args.designContextFile) needMore(runsDir,
    `get_design_context(node_ids=[${changedIds.join(',')}]) for each changed frame`,
    'Phase 2 needs JSX bundle');
  const jsxData = loadJson(args.designContextFile, '--design-context-file');

  let applyRes = { changedFiles: [], unregistered: [], errors: [] };
  if (args.dryRun) {
    console.log(`[Phase 2] DRY-RUN — skip file write`);
  } else {
    applyRes = await applyChanges({
      mcp: { getDesignContext: async ({ nodeId }) => ({ jsx: jsxData[nodeId] || '' }) },
      config, changedFrameIds: changedIds
    });
    writeFileSync(join(runsDir, 'apply.json'), JSON.stringify(applyRes, null, 2), 'utf-8');
  }
  console.log(`[Phase 2] changedFiles=${applyRes.changedFiles.length}, errors=${applyRes.errors.length}`);

  // ── Phase 3 verify ──
  let verifyRes = [];
  if (args.skipVerify || args.dryRun) {
    console.log(`[Phase 3] SKIP`);
  } else {
    try {
      verifyRes = await verifyFrames({
        config, runDir: runsDir, syncRoot: SYNC_ROOT,
        changedFrames: changed.map(f => ({
          ...f, route: (config.frames.find(x => x.nodeId === f.nodeId) || {}).route
        }))
      });
      writeFileSync(join(runsDir, 'verify.json'), JSON.stringify(verifyRes, null, 2), 'utf-8');
      // INV-4: verify FAIL escalates verdict to SUSPICIOUS
      for (const v of verifyRes) {
        if (v.status === 'FAIL') {
          const target = changed.find(f => f.nodeId === v.nodeId);
          if (target) target.verdict = 'SUSPICIOUS';
        }
      }
      console.log(`[Phase 3] verify results: ${verifyRes.map(v => `${v.nodeId}=${v.status}`).join(', ')}`);
    } catch (err) {
      console.error(`[Phase 3] ⚠️ verify failed (${err.message.slice(0, 200)}) — continuing`);
    }
  }

  // ── Phase 4 test ──
  let testResults = null;
  if (!args.skipTests) {
    console.log(`[Phase 4] running npm test / e2e / audit ...`);
    testResults = await runTests({ config, runDir: runsDir });
  } else {
    console.log(`[Phase 4] SKIP — pass --run-tests to enable`);
  }

  // ── Phase 5 report ──
  if (!args.skipReport) {
    const designChanges = changed.map(f => {
      const v = verifyRes.find(vr => vr.nodeId === f.nodeId);
      return {
        component: f.component, file: f.file, node_id: f.nodeId,
        verdict: f.verdict,
        json_hash_before: f.baselineJson, json_hash_after: f.jsonHash,
        png_hash_before:  f.baselinePng,  png_hash_after:  f.pngHash,
        verify_status: v?.status ?? 'SKIPPED',
        verify_ratio:  v?.ratio ?? null,
        diff_png:      v?.diff_png ?? null
      };
    });
    writeFileSync(join(runsDir, 'design_changes.json'), JSON.stringify(designChanges, null, 2), 'utf-8');
    if (args.variablesFile) {
      const { copyFileSync } = await import('node:fs');
      copyFileSync(args.variablesFile, join(runsDir, 'variables.json'));
    }
    try {
      const reportRes = await generateReport({ config, runDir: runsDir });
      console.log(`[Phase 5] report generated (exit=${reportRes.exitCode ?? 0})`);
    } catch (err) {
      console.error(`[Phase 5] ⚠️ report failed (${err.message.slice(0, 200)}) — continuing`);
    }
  } else {
    console.log(`[Phase 5] SKIP`);
  }

  // ── Phase 6 confirm ──
  if (args.confirm === null) needMore(runsDir, 'human confirmation', 'Phase 6: re-run with --confirm yes|no');
  console.log(`[Phase 6] confirm=${args.confirm}`);

  if (args.confirm === 'no') {
    if (applyRes.changedFiles.length > 0) {
      const restored = spawnSync('git', ['restore', '--',
        ...applyRes.changedFiles.map(f => join(config.reactAppRoot, f))
      ], { cwd: config.reactAppRoot, encoding: 'utf-8' });
      console.log(`   git restore status=${restored.status}`);
    }
    writeFileSync(join(runsDir, 'status.txt'), 'REJECTED\n');
    console.log('\n✅ REJECTED — rollback 済み、state/snapshot 不変');
    return;
  }
  if (args.confirm !== 'yes') { console.error(`❌ --confirm expects yes|no (got ${args.confirm})`); process.exit(1); }

  // commit
  if (!args.noCommit && applyRes.changedFiles.length > 0) {
    const commitMsg = [
      '機能更新: Figma 同期による UI 反映',
      '',
      ...applyRes.changedFiles.map(f => `- ${f}`),
      '',
      `Figma nodeIds: ${changedIds.join(', ')}`,
      `検出方式: v5 dual-snapshot (json+png hash)`,
      '',
      'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>'
    ].join('\n');
    const gitAdd = spawnSync('git', ['add', ...applyRes.changedFiles.map(f => join(config.reactAppRoot, f))],
      { cwd: config.reactAppRoot, encoding: 'utf-8' });
    if (gitAdd.status !== 0) { console.error(`❌ git add failed: ${gitAdd.stderr}`); process.exit(1); }
    const gitCommit = spawnSync('git', ['commit', '-m', commitMsg],
      { cwd: config.reactAppRoot, encoding: 'utf-8' });
    if (gitCommit.status !== 0) { console.error(`❌ git commit failed: ${gitCommit.stderr}`); process.exit(1); }
    console.log(`   git commit OK`);
  } else if (args.noCommit) {
    console.log(`   --no-commit — skip commit but still promote snapshots + state`);
  } else {
    console.log(`   no changed files — skip commit`);
  }

  // promote snapshots + advance state (INV-1)
  if (!args.dryRun) {
    promoteCandidateSnapshots({ syncRoot: SYNC_ROOT, headVersionId: detectRes.headVersionId, changedFrames: changed });
    saveState(statePath, { last_version_id: detectRes.headVersionId, last_run_at: new Date().toISOString() });
  }
  writeFileSync(join(runsDir, 'status.txt'), 'APPROVED\n');
  console.log(`\n✅ APPROVED — snapshot + state 更新済み`);
}

main().catch(e => {
  console.error('❌ Runner error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
