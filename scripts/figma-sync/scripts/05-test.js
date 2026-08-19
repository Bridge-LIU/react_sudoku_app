#!/usr/bin/env node
// Usage: node 05-test.js <run-dir>
// react_sudoku_app 側で全種テスト実行、結果を集計して JSON 出力

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import { parseVitestJson, parseJestJson, aggregateCoverage } from './lib/test-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..'); // react_sudoku_app itself
const APP = REPO_ROOT; // react app root = repo root

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 05-test.js <run-dir>'); process.exit(1); }
const covDir = path.join(runDir, 'coverage');
fs.mkdirSync(covDir, { recursive: true });

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', shell: true });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Vitest with coverage
console.log('▶ vitest run --coverage...');
const vitestJsonPath = path.join(runDir, 'vitest.json');
run('npx', ['vitest', 'run', '--coverage', '--reporter=json', '--outputFile=' + vitestJsonPath], APP);
const vitestJson = fs.existsSync(vitestJsonPath) ? JSON.parse(fs.readFileSync(vitestJsonPath, 'utf-8')) : { numTotalTests: 0 };
const vitestCovPath = path.join(APP, 'coverage', 'coverage-summary.json');
const vitestCov = fs.existsSync(vitestCovPath) ? JSON.parse(fs.readFileSync(vitestCovPath, 'utf-8')) : {};

// Jest (only if configured)
let jestJson = { numTotalTests: 0 };
let jestCov = {};
if (fs.existsSync(path.join(APP, 'jest.config.ts')) || fs.existsSync(path.join(APP, 'jest.config.js'))) {
  console.log('▶ jest --coverage...');
  const jestJsonPath = path.join(runDir, 'jest.json');
  run('npx', ['jest', '--coverage', '--json', '--outputFile=' + jestJsonPath], APP);
  if (fs.existsSync(jestJsonPath)) jestJson = JSON.parse(fs.readFileSync(jestJsonPath, 'utf-8'));
}

// Playwright
console.log('▶ playwright test...');
run('npx', ['playwright', 'test', '--reporter=json'], APP);

// npm audit
console.log('▶ npm audit...');
const audit = run('npm', ['audit', '--json'], APP);
fs.writeFileSync(path.join(runDir, 'audit.json'), audit.stdout || '{}');

const results = {
  vitest: parseVitestJson(vitestJson),
  jest: parseJestJson(jestJson),
  audit: JSON.parse(audit.stdout || '{}'),
  coverage: aggregateCoverage(vitestCov, jestCov),
};
fs.writeFileSync(path.join(runDir, 'test-results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(covDir, 'summary.json'), JSON.stringify(results.coverage, null, 2));

const totalFail = results.vitest.failed + results.jest.failed;
console.log(`\n✔ total ${results.vitest.total + results.jest.total} tests, ${totalFail} failed`);
console.log(`✔ coverage: line ${results.coverage.line.toFixed(1)}%, branch ${results.coverage.branch.toFixed(1)}%`);
