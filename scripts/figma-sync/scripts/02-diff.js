#!/usr/bin/env node
// Usage: node 02-diff.js <run-dir>
// snapshots/previous と current を比較、runs/<ts>/diff.json 出力

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import { computeDiff } from './lib/diff.js';
import { writeStatus } from './lib/run-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const config = loadConfig();

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 02-diff.js <run-dir>'); process.exit(1); }

const curPath = path.join(ROOT, 'snapshots', 'current', 'dump.json');
const prevPath = path.join(ROOT, 'snapshots', 'previous', 'dump.json');
if (!fs.existsSync(curPath)) { console.error('current dump missing'); process.exit(1); }

const current = JSON.parse(fs.readFileSync(curPath, 'utf-8'));
const previous = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf-8')) : null;

const result = computeDiff(previous, current, config.diffProps);
fs.writeFileSync(path.join(runDir, 'diff.json'), JSON.stringify(result, null, 2));

const total = result.added.length + result.removed.length + result.modified.length;
console.log(`diff: +${result.added.length} -${result.removed.length} ~${result.modified.length}`);

if (previous === null) {
  writeStatus(runDir, 'BASELINE');
  console.log('BASELINE: previous 不在、current を baseline として昇格候補');
  process.exit(0);
}
if (total === 0) {
  writeStatus(runDir, 'NO_CHANGE');
  console.log('NO_CHANGE: 差分なし、早退');
  process.exit(2); // exit 2 = early return
}
