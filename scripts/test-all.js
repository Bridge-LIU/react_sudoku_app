#!/usr/bin/env node
/**
 * test:all ラッパー
 *
 * Vitest → Jest → Playwright を順に走らせ、
 * 各ツールの出力から実測値を抽出、最後に日本語の統合サマリを出す。
 *
 * === Vue との対応 ===
 *   Vue 側で vitest + cypress を1コマンドで走らせる際に、
 *   npm-run-all + カスタム reporter で似たことをやる。
 *   ここは軽量に、依存追加なしで child_process と正規表現だけで実現。
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

// ANSI カラー（Windows Terminal / VS Code / GitHub Actions で表示可能）
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';

/**
 * 1 コマンド実行し、stdout/stderr をキャプチャしつつ画面にも流す。
 * @returns {{ code: number, stdout: string, stderr: string, ms: number }}
 */
function runCapture(label, args) {
  console.log(`\n${C.cyan}${C.bold}▶ [${label}] ${NPM} ${args.join(' ')}${C.reset}`);
  const start = Date.now();

  // spawnSync + inherit だと output 取れないので pipe にして handle 側で tee する
  // Windows は npm.cmd が batch なので shell:true 必須。Unix は sh 経由でも問題無し。
  const child = spawnSync(NPM, args, {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf-8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const ms = Date.now() - start;
  const stdout = child.stdout ?? '';
  const stderr = child.stderr ?? '';

  // ライブ表示（テスト実行中に画面が真っ黒だと不安なので事後に一括表示）
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return { code: child.status ?? -1, stdout, stderr, ms };
}

/**
 * Vitest 出力から件数と実行時間を抽出。
 *   Test Files  15 passed (15)
 *        Tests  115 passed (115)
 *     Duration  3.18s
 */
function parseVitest(out) {
  const files = out.match(/Test Files\s+(\d+)\s+passed\s+\((\d+)\)/);
  const tests = out.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
  const dur = out.match(/Duration\s+([\d.]+)s/);
  const failed = /(\d+)\s+failed/.exec(out);
  return {
    filesPassed: files ? Number(files[1]) : null,
    filesTotal: files ? Number(files[2]) : null,
    passed: tests ? Number(tests[1]) : null,
    total: tests ? Number(tests[2]) : null,
    failed: failed ? Number(failed[1]) : 0,
    duration: dur ? Number(dur[1]) : null,
  };
}

/**
 * Jest 出力から件数と実行時間を抽出。
 *   Test Suites: 4 passed, 4 total
 *   Tests:       20 passed, 20 total
 *   Snapshots:   6 passed, 6 total
 *   Time:        23.28 s
 */
function parseJest(out) {
  const suites = out.match(/Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  const tests = out.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  const snaps = out.match(/Snapshots:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
  const time = out.match(/Time:\s+([\d.]+)\s*s/);
  const failed = /(\d+)\s+failed/.exec(out);
  return {
    suitesPassed: suites ? Number(suites[1]) : null,
    suitesTotal: suites ? Number(suites[2]) : null,
    passed: tests ? Number(tests[1]) : null,
    total: tests ? Number(tests[2]) : null,
    snapPassed: snaps ? Number(snaps[1]) : 0,
    snapTotal: snaps ? Number(snaps[2]) : 0,
    failed: failed ? Number(failed[1]) : 0,
    duration: time ? Number(time[1]) : null,
  };
}

/**
 * Playwright 出力から件数と実行時間を抽出。
 *   17 passed (15.7s)
 * ANSI エスケープが混ざっているので stripAnsi してから match。
 */
function parsePlaywright(out) {
  const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
  const summary = plain.match(/(\d+)\s+passed\s+\(([\d.]+)s\)/);
  const failed = /(\d+)\s+failed/.exec(plain);
  // 内訳（spec ファイル別集計）
  // Windows: e2e\security.spec.ts  /  Unix: e2e/security.spec.ts  両対応
  // basename だけ拾う
  const bySpec = new Map();
  const re = /(?:[\\/])([\w.-]+)\.spec\.ts:/g;
  let m;
  while ((m = re.exec(plain)) !== null) {
    bySpec.set(m[1], (bySpec.get(m[1]) ?? 0) + 1);
  }
  return {
    passed: summary ? Number(summary[1]) : null,
    duration: summary ? Number(summary[2]) : null,
    failed: failed ? Number(failed[1]) : 0,
    bySpec: Object.fromEntries(bySpec),
  };
}

// ─── 実行 ─────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}════════════════════════════════════════════════${C.reset}`);
console.log(`${C.bold}${C.cyan}  数独ゲーム テスト一括実行 (npm run test:all)${C.reset}`);
console.log(`${C.bold}${C.cyan}════════════════════════════════════════════════${C.reset}`);
console.log(`${C.dim}実行日時: ${new Date().toLocaleString('ja-JP')}${C.reset}`);

const totalStart = Date.now();

const vitest = runCapture('1/3 Vitest', ['run', 'test:engine']);
const jest = runCapture('2/3 Jest + RTL', ['run', 'test:components']);
const playwright = runCapture('3/3 Playwright', ['run', 'test:e2e']);

const totalMs = Date.now() - totalStart;

// ─── パース ────────────────────────────────────────────
const v = parseVitest(vitest.stdout + vitest.stderr);
const j = parseJest(jest.stdout + jest.stderr);
const p = parsePlaywright(playwright.stdout + playwright.stderr);

// ─── サマリ描画 ────────────────────────────────────────
const ok = (n) => `${C.green}✓${C.reset} ${n}`;
const ng = (n) => `${C.red}✗${C.reset} ${n}`;
const badge = (failed) => (failed === 0 ? `${C.green}${C.bold}PASS${C.reset}` : `${C.red}${C.bold}FAIL${C.reset}`);
const num = (n) => (n === null ? '?' : String(n));
const dur = (n) => (n === null ? '?' : `${n.toFixed(2)}s`);

const grandPassed = (v.passed ?? 0) + (j.passed ?? 0) + (p.passed ?? 0);
const grandTotal = (v.total ?? 0) + (j.total ?? 0) + (p.passed ?? 0);
const grandFailed = v.failed + j.failed + p.failed;
const rate = grandTotal > 0 ? ((grandPassed / grandTotal) * 100).toFixed(1) : '0.0';
const overallOk = grandFailed === 0 && vitest.code === 0 && jest.code === 0 && playwright.code === 0;

console.log(`\n${C.bold}${C.yellow}════════════════════════════════════════════════════════════════${C.reset}`);
console.log(`${C.bold}${C.yellow}                    テスト実施サマリ                            ${C.reset}`);
console.log(`${C.bold}${C.yellow}════════════════════════════════════════════════════════════════${C.reset}`);

const rows = [
  {
    no: '①',
    name: '単体・契約・統合テスト (Vitest)',
    detail: `${num(v.filesPassed)}/${num(v.filesTotal)} files`,
    count: `${num(v.passed)}/${num(v.total)}`,
    time: dur(v.duration),
    failed: v.failed,
    code: vitest.code,
  },
  {
    no: '②',
    name: 'UI 部品テスト (Jest + RTL)',
    detail: `${num(j.suitesPassed)}/${num(j.suitesTotal)} suites, snap ${num(j.snapPassed)}`,
    count: `${num(j.passed)}/${num(j.total)}`,
    time: dur(j.duration),
    failed: j.failed,
    code: jest.code,
  },
  {
    no: '③',
    name: 'E2E・セキュリティ・a11y (Playwright)',
    detail: Object.entries(p.bySpec).map(([k, v]) => `${k.replace('.spec.ts', '')}=${v}`).join(' / '),
    count: `${num(p.passed)}/${num(p.passed)}`,
    time: dur(p.duration),
    failed: p.failed,
    code: playwright.code,
  },
];

for (const r of rows) {
  const status = r.failed === 0 && r.code === 0
    ? `${C.green}✓ PASS${C.reset}`
    : `${C.red}✗ FAIL${C.reset}`;
  console.log(` ${r.no} ${r.name.padEnd(38, ' ')} ${r.count.padStart(9, ' ')} ${status}   ${C.dim}${r.time.padStart(7, ' ')} ${r.detail}${C.reset}`);
}

console.log(`${C.dim}────────────────────────────────────────────────────────────────${C.reset}`);
console.log(
  ` ${C.bold}総合${C.reset}                                            ` +
  `${C.bold}${grandPassed}/${grandTotal}${C.reset} ${badge(grandFailed)}   ` +
  `${C.dim}(${rate}%, 総実行時間 ${(totalMs / 1000).toFixed(2)}s)${C.reset}`
);
console.log(`${C.bold}${C.yellow}════════════════════════════════════════════════════════════════${C.reset}`);

if (!overallOk) {
  console.log(`\n${C.red}${C.bold}⚠ いずれかのテストが失敗しました。詳細は上部の出力を確認してください。${C.reset}`);
  process.exit(1);
}
console.log(`\n${C.green}${C.bold}✓ 全テスト成功${C.reset}`);
process.exit(0);
