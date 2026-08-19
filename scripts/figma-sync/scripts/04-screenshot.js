#!/usr/bin/env node
// Usage: node 04-screenshot.js <run-dir>
// Assumes dev server already running at config.devServer.url
// Component preview route: <devUrl>/__figma-sync-preview__/<component>
// (this route needs to be added to react app in Task 12)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config-loader.js';
import { diffImages } from './lib/screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..'); // react_sudoku_app
const config = loadConfig();

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 04-screenshot.js <run-dir>'); process.exit(1); }

const changed = JSON.parse(fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf-8'));
const shotDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });

const devUrl = config.devServer.url;
const { width, height } = config.playwright.viewport;

const browser = await chromium.launch();
try {
  for (const cf of changed.changedFiles) {
    const url = `${devUrl}/__figma-sync-preview__/${cf.component}`;

    // AFTER shot (current file state)
    const ctxA = await browser.newContext({ viewport: { width, height } });
    const pageA = await ctxA.newPage();
    await pageA.goto(url, { waitUntil: 'networkidle' });
    const afterBuf = await pageA.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(shotDir, `${cf.component}_after.png`), afterBuf);
    await ctxA.close();

    // BEFORE shot: temporarily restore .bak, take shot, restore current
    const abs = path.join(REPO_ROOT, cf.file);
    const bak = abs + '.bak';
    const currentContent = fs.readFileSync(abs, 'utf-8');
    fs.copyFileSync(bak, abs);
    await new Promise(r => setTimeout(r, 2000)); // Vite HMR

    const ctxB = await browser.newContext({ viewport: { width, height } });
    const pageB = await ctxB.newPage();
    await pageB.goto(url, { waitUntil: 'networkidle' });
    const beforeBuf = await pageB.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(shotDir, `${cf.component}_before.png`), beforeBuf);
    await ctxB.close();

    fs.writeFileSync(abs, currentContent);
    await new Promise(r => setTimeout(r, 2000)); // Vite HMR

    try {
      const { diffPixels, diffPng } = diffImages(beforeBuf, afterBuf, config.pixelmatchThreshold);
      fs.writeFileSync(path.join(shotDir, `${cf.component}_diff.png`), diffPng);
      console.log(`${cf.component}: ${diffPixels} diff pixels`);
    } catch (e) {
      console.warn(`${cf.component}: diff failed (${e.message}) — サイズ違い可能性`);
    }
  }
} finally {
  await browser.close();
}
