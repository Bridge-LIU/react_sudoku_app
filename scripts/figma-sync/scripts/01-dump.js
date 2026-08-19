#!/usr/bin/env node
// Usage: node 01-dump.js < mcp-response.json
// stdin から MCP use_figma の JSON 文字列 (result field) を受け取り、
// snapshots/current/dump.json に保存する

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const config = loadConfig();

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => raw += chunk);
process.stdin.on('end', () => {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // walk.js は再度 JSON.stringify した文字列を返すので二重パース
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  } catch (e) {
    console.error('Failed to parse MCP response:', e.message);
    process.exit(1);
  }

  const REQUIRED = ['version', 'lastModified', 'pages'];
  for (const f of REQUIRED) {
    if (parsed[f] === undefined) {
      console.error(`Missing field in MCP response: ${f}`);
      process.exit(1);
    }
  }
  for (const pageId of Object.keys(config.pages).map(k => config.pages[k])) {
    if (!parsed.pages[pageId]) {
      console.error(`Missing page in MCP response: ${pageId}`);
      process.exit(1);
    }
  }

  const outDir = path.join(ROOT, 'snapshots', 'current');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'dump.json');
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
  console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
});
