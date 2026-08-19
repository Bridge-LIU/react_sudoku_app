#!/usr/bin/env node
// Usage: node 03-apply.js <run-dir> [prepare|validate]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import { mapNodesToFiles } from './lib/mapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..'); // react_sudoku_app itself
const config = loadConfig();

const runDir = process.argv[2];
const mode = process.argv[3] || 'prepare';
if (!runDir) { console.error('Usage: 03-apply.js <run-dir> [prepare|validate]'); process.exit(1); }

const diff = JSON.parse(fs.readFileSync(path.join(runDir, 'diff.json'), 'utf-8'));
const mapped = mapNodesToFiles(diff, config.frames);

if (mode === 'prepare') {
  for (const cf of mapped.changedFiles) {
    const abs = path.join(REPO_ROOT, cf.file);
    if (!fs.existsSync(abs)) {
      console.error(`Missing file: ${cf.file}`);
      process.exit(1);
    }
    fs.copyFileSync(abs, abs + '.bak');
  }
  fs.writeFileSync(path.join(runDir, 'changed-files.json'), JSON.stringify(mapped, null, 2));
  console.log(`prepare: ${mapped.changedFiles.length} files backed up, ${mapped.unregistered.length} unregistered warnings`);
} else if (mode === 'validate') {
  let changedCount = 0;
  for (const cf of mapped.changedFiles) {
    const abs = path.join(REPO_ROOT, cf.file);
    const bak = abs + '.bak';
    if (!fs.existsSync(bak)) { console.error(`.bak missing for ${cf.file}`); continue; }
    if (fs.readFileSync(abs, 'utf-8') !== fs.readFileSync(bak, 'utf-8')) changedCount++;
  }
  console.log(`validate: ${changedCount}/${mapped.changedFiles.length} files actually modified`);
  if (changedCount === 0) {
    console.error('WARN: no file was modified by Claude');
    process.exit(1);
  }
}
