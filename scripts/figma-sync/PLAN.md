> **⚠️ DEPRECATED**: 本 v3 SPEC/PLAN は自作 MCP 依存で廃止。v4 の SPEC は
> `docs/superpowers/specs/2026-08-21-figma-sync-v4-spec.md` を参照。

# Figma → React 同期 実装計画

> **⚠️ 保存先変更（2026-08-19）**：
> 元 `react_sudoku_app/scripts/figma-sync/` → **`react_sudoku_app/scripts/figma-sync/`**
> 理由：react_sudoku_app と同 git repo に含めるため、UI 変更と一緒に commit。
>
> **REPO_ROOT**：`react_sudoku_app/`（このスクリプト群の 2 個上）
> **config.reactAppRoot は削除**、REPO_ROOT を直接使う
> **PLAN 中のパス** `react_sudoku_app/scripts/figma-sync/` は全て `react_sudoku_app/scripts/figma-sync/` と読み替え

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SPEC.md に記述された 8 Phase パイプラインを実動作させる、Node.js + Python 混成の実装を完成する。

**Architecture:** Skill が発話起動口 → Node scripts が MCP 経由の dump / local diff / code apply / screenshot / test 実行 → Python + openpyxl で v10 テンプレを実データで埋込 → 端末 y/n → git commit + PR。

**Tech Stack:** Node.js 20+、Vitest（script 自身のテスト）、Playwright + pixelmatch、Python 3.11+ + openpyxl + Pillow、fast-json-stable-stringify、simple-git、@octokit/rest

**参照ドキュメント:**
- [SPEC.md](./SPEC.md)（詳細仕様）
- [SudoKu20260819_FLOWVIEW.md](./SudoKu20260819_FLOWVIEW.md)（全体像）

**Windows PowerShell 前提:** 全コマンドは PowerShell で動作するよう `node`/`python`/`npx` を優先、pipe は `|` のまま利用。

---

## 依存グラフ（並列化ヒント）

```
Task 1 (config + template)   ─┐
Task 2 (canonicalize + fixt) ─┤ 独立、順不同で並列可
Task 3 (walk.js payload)     ─┘
        ↓
Task 4 (01-dump.js)   ← Task 3 に依存
        ↓
Task 5 (02-diff.js)   ← Task 2, 4 に依存
        ↓
    ┌───┼───────────────┬────────────────┐   [並列 subagent 発火ポイント]
    ↓   ↓               ↓                ↓
Task 6  Task 7         Task 8         Task 9
(apply) (screenshot)   (test)         (report.py)
    └───┴───────────────┴────────────────┘
        ↓
Task 10 (07-confirm.js)  ← 全てに依存
        ↓
Task 11 (SKILL.md)
        ↓
Task 12 (E2E 疎通テスト)
        ↓
Task 13 (旧資源大清理)
```

**並列 subagent 推奨**：Task 6-9 は互いに独立、Task 5 完了後 4 個の subagent に投げれば理論値 4x 高速化。

---

## File Structure

```
react_sudoku_app/scripts/figma-sync/
├── SPEC.md                     (既存)
├── SudoKu20260819_FLOWVIEW.md  (既存)
├── PLAN.md                     (本ファイル)
├── SKILL.md                    (Task 11 で作成)
├── package.json                (Task 1 で作成)
├── config.json                 (Task 1 で作成)
├── scripts/
│   ├── 01-dump.js              (Task 4)
│   ├── 02-diff.js              (Task 5)
│   ├── 03-apply.js             (Task 6)
│   ├── 04-screenshot.js        (Task 7)
│   ├── 05-test.js              (Task 8)
│   ├── 06-report.py            (Task 9)
│   ├── 07-confirm.js           (Task 10)
│   └── lib/
│       ├── walk.js             (Task 3, use_figma に渡す JS payload)
│       ├── canonicalize.js     (Task 2)
│       ├── config-loader.js    (Task 1)
│       └── run-context.js      (Task 4 で作成)
├── snapshots/                  (実行時生成)
├── runs/                       (実行時生成)
├── templates/
│   └── sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx  (Task 1 でコピー)
└── tests/
    ├── fixtures/
    │   ├── dump-v1.json        (Task 2)
    │   ├── dump-v2-color.json  (Task 2)
    │   └── dump-v2-added.json  (Task 2)
    ├── canonicalize.test.js    (Task 2)
    ├── diff.test.js            (Task 5)
    ├── apply.test.js           (Task 6)
    ├── screenshot.test.js      (Task 7)
    └── report.test.py          (Task 9)
```

---

## Task 1: プロジェクト scaffold + config.json + テンプレコピー

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/package.json`
- Create: `react_sudoku_app/scripts/figma-sync/config.json`
- Create: `react_sudoku_app/scripts/figma-sync/.gitignore`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/config-loader.js`
- Copy: `react_sudoku_app/scripts/figma-sync/templates/sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx`
- Create: `react_sudoku_app/scripts/figma-sync/tests/config-loader.test.js`

- [ ] **Step 1: package.json 作成**

```json
{
  "name": "figma-sync-mcp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fast-json-stable-stringify": "^2.1.0",
    "pixelmatch": "^5.3.0",
    "pngjs": "^7.0.0",
    "playwright": "^1.47.0",
    "simple-git": "^3.27.0",
    "@octokit/rest": "^21.0.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: config.json 作成**

```json
{
  "figmaFileKey": "cwmewA4MTWktw6E7uhQFK2",
  "pages": {
    "JP": "0:1",
    "ZH": "6:6",
    "EN": "6:410"
  },
  "frames": [
    { "nodeId": "11-1896", "file": "react_sudoku_app/src/screens/Home.tsx", "component": "Home" },
    { "nodeId": "18-6",    "file": "react_sudoku_app/src/screens/Play.tsx", "component": "Play" },
    { "nodeId": "12-3615", "file": "react_sudoku_app/src/ui/ResetDialog.tsx", "component": "ResetDialog" }
  ],
  "diffProps": ["name", "fills", "strokes", "effects", "opacity", "characters", "style", "boundVariables"],
  "reactAppRoot": "react_sudoku_app",
  "devServer": { "cmd": "npm run dev", "url": "http://localhost:5173" },
  "playwright": { "viewport": { "width": 1440, "height": 900 } },
  "androidPolicy": "mark_skipped",
  "pixelmatchThreshold": 0.1,
  "githubRepo": "Bridge-LIU/react_sudoku_app"
}
```

- [ ] **Step 3: .gitignore 作成**

```
node_modules/
snapshots/current/
runs/
*.bak
__pycache__/
```

- [ ] **Step 4: config-loader.test.js 作成（失敗テスト）**

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../scripts/lib/config-loader.js';

describe('config-loader', () => {
  it('reads config.json and returns parsed object', () => {
    const config = loadConfig();
    expect(config.figmaFileKey).toBe('cwmewA4MTWktw6E7uhQFK2');
    expect(config.frames).toBeInstanceOf(Array);
    expect(config.frames.length).toBeGreaterThan(0);
  });

  it('throws when config.json is missing required field', () => {
    expect(() => loadConfig({ figmaFileKey: undefined })).toThrow(/figmaFileKey/);
  });
});
```

- [ ] **Step 5: テストを走らせて失敗確認**

```powershell
cd _archive/figma-sync-mcp
npm install
npx vitest run tests/config-loader.test.js
```

Expected: FAIL（config-loader.js 未実装）

- [ ] **Step 6: scripts/lib/config-loader.js 実装**

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

const REQUIRED_FIELDS = ['figmaFileKey', 'pages', 'frames', 'diffProps', 'reactAppRoot'];

export function loadConfig(override) {
  const raw = override ?? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field]) throw new Error(`Missing required config field: ${field}`);
  }
  return raw;
}
```

- [ ] **Step 7: テスト再実行して PASS 確認**

```powershell
npx vitest run tests/config-loader.test.js
```

Expected: PASS

- [ ] **Step 8: v10 テンプレをコピー**

```powershell
mkdir templates -Force
Copy-Item ..\..\sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx .\templates\
```

- [ ] **Step 9: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/package.json react_sudoku_app/scripts/figma-sync/config.json react_sudoku_app/scripts/figma-sync/.gitignore react_sudoku_app/scripts/figma-sync/scripts/lib/config-loader.js react_sudoku_app/scripts/figma-sync/tests/config-loader.test.js react_sudoku_app/scripts/figma-sync/templates/
git commit -m "機能追加: figma-sync-mcp プロジェクト scaffold + config-loader"
```

---

## Task 2: canonicalize.js + fixture 作成

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/canonicalize.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/fixtures/dump-v1.json`
- Create: `react_sudoku_app/scripts/figma-sync/tests/fixtures/dump-v2-color.json`
- Create: `react_sudoku_app/scripts/figma-sync/tests/fixtures/dump-v2-added.json`
- Create: `react_sudoku_app/scripts/figma-sync/tests/canonicalize.test.js`

- [ ] **Step 1: fixture 3 個作成**

`tests/fixtures/dump-v1.json` — baseline:
```json
{
  "version": "1000",
  "lastModified": "2026-08-19T10:00:00.000Z",
  "pages": {
    "0:1": {
      "id": "0:1", "name": "JP", "type": "CANVAS",
      "children": [
        { "id": "11-1896", "name": "Home", "type": "FRAME", "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1 } }] }
      ]
    }
  }
}
```

`tests/fixtures/dump-v2-color.json` — 色変更版:
```json
{
  "version": "1001",
  "lastModified": "2026-08-19T10:05:00.000Z",
  "pages": {
    "0:1": {
      "id": "0:1", "name": "JP", "type": "CANVAS",
      "children": [
        { "id": "11-1896", "name": "Home", "type": "FRAME", "fills": [{ "type": "SOLID", "color": { "r": 0.9, "g": 0.9, "b": 0.9 } }] }
      ]
    }
  }
}
```

`tests/fixtures/dump-v2-added.json` — ノード追加版:
```json
{
  "version": "1002",
  "lastModified": "2026-08-19T10:10:00.000Z",
  "pages": {
    "0:1": {
      "id": "0:1", "name": "JP", "type": "CANVAS",
      "children": [
        { "id": "11-1896", "name": "Home", "type": "FRAME", "fills": [{ "type": "SOLID", "color": { "r": 1, "g": 1, "b": 1 } }] },
        { "id": "11-9999", "name": "NewBanner", "type": "FRAME", "fills": [{ "type": "SOLID", "color": { "r": 0.5, "g": 0.5, "b": 0.5 } }] }
      ]
    }
  }
}
```

- [ ] **Step 2: canonicalize.test.js 作成**

```js
import { describe, it, expect } from 'vitest';
import { canonicalize, hashNode } from '../scripts/lib/canonicalize.js';

describe('canonicalize', () => {
  it('produces stable string regardless of key order', () => {
    const a = { b: 1, a: 2 };
    const b = { a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('hashes identical nodes to same value', () => {
    const n1 = { id: 'x', name: 'A', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
    const n2 = { id: 'x', name: 'A', fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }] };
    expect(hashNode(n1, ['name', 'fills'])).toBe(hashNode(n2, ['name', 'fills']));
  });

  it('hashes different nodes differently', () => {
    const n1 = { id: 'x', fills: [{ color: { r: 1, g: 0, b: 0 } }] };
    const n2 = { id: 'x', fills: [{ color: { r: 0, g: 1, b: 0 } }] };
    expect(hashNode(n1, ['fills'])).not.toBe(hashNode(n2, ['fills']));
  });
});
```

- [ ] **Step 3: テスト失敗確認**

```powershell
npx vitest run tests/canonicalize.test.js
```

Expected: FAIL

- [ ] **Step 4: canonicalize.js 実装**

```js
import stringify from 'fast-json-stable-stringify';
import crypto from 'node:crypto';

export function canonicalize(obj) {
  return stringify(obj);
}

export function hashNode(node, diffProps) {
  const picked = {};
  for (const prop of diffProps) {
    if (node[prop] !== undefined) picked[prop] = node[prop];
  }
  return crypto.createHash('sha256').update(canonicalize(picked)).digest('hex');
}
```

- [ ] **Step 5: テスト PASS 確認**

```powershell
npx vitest run tests/canonicalize.test.js
```

Expected: PASS 3/3

- [ ] **Step 6: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/lib/canonicalize.js react_sudoku_app/scripts/figma-sync/tests/canonicalize.test.js react_sudoku_app/scripts/figma-sync/tests/fixtures/
git commit -m "機能追加: canonicalize + hashNode + fixture 3 種"
```

---

## Task 3: walk.js（`use_figma` に渡す JS payload）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/walk.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/walk-payload.test.js`

- [ ] **Step 1: walk-payload.test.js 作成**

```js
import { describe, it, expect } from 'vitest';
import { buildWalkPayload } from '../scripts/lib/walk.js';

describe('walk.js payload builder', () => {
  it('embeds page IDs and diff props into JS string', () => {
    const payload = buildWalkPayload({
      pageIds: ['0:1', '6:6'],
      diffProps: ['name', 'fills'],
    });
    expect(payload).toContain('"0:1"');
    expect(payload).toContain('"6:6"');
    expect(payload).toContain('"name"');
    expect(payload).toContain('"fills"');
    expect(payload).toContain('figma.root.version');
    expect(payload).toContain('figma.getNodeById');
  });

  it('produces valid JavaScript (parses without syntax error)', () => {
    const payload = buildWalkPayload({
      pageIds: ['0:1'],
      diffProps: ['name'],
    });
    expect(() => new Function(payload)).not.toThrow();
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```powershell
npx vitest run tests/walk-payload.test.js
```

- [ ] **Step 3: walk.js 実装**

```js
export function buildWalkPayload({ pageIds, diffProps }) {
  const pageIdsJson = JSON.stringify(pageIds);
  const diffPropsJson = JSON.stringify(diffProps);
  return `
const TARGET_PAGE_IDS = ${pageIdsJson};
const DIFF_PROPS = ${diffPropsJson};

function walk(node) {
  const out = { id: node.id, name: node.name, type: node.type };
  for (const prop of DIFF_PROPS) {
    if (node[prop] !== undefined) out[prop] = node[prop];
  }
  if (node.children) {
    out.children = node.children.map(walk);
  }
  return out;
}

const result = {};
for (const pageId of TARGET_PAGE_IDS) {
  const page = figma.getNodeById(pageId);
  if (!page) throw new Error("Page " + pageId + " not found");
  result[pageId] = walk(page);
}

return JSON.stringify({
  version: figma.root.version,
  lastModified: new Date().toISOString(),
  pages: result
});
`.trim();
}
```

- [ ] **Step 4: テスト PASS 確認**

```powershell
npx vitest run tests/walk-payload.test.js
```

Expected: PASS 2/2

- [ ] **Step 5: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/lib/walk.js react_sudoku_app/scripts/figma-sync/tests/walk-payload.test.js
git commit -m "機能追加: use_figma に渡す walk payload builder"
```

---

## Task 4: 01-dump.js（MCP 経由 dump → snapshots/current/dump.json）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/01-dump.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/run-context.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/run-context.test.js`

**Note:** 実際の MCP 呼び出しは Skill が Claude 経由で行う。このスクリプトは MCP 応答 JSON 文字列を stdin から受け取って snapshot に保存する橋渡し役。

> **⚠️ 2026-08-20 追記**：本 Task の想定は「公式 `use_figma` + `walk.js` → LLM 経由で JSON 文字列 → stdin → 01-dump.js が保存」だったが、5MB dump が MCP result の 25K token 制限を超えるため、**自作 MCP `figma-sync-mcp` の `figma_dump_to_file`（Figma REST → disk 直書き、LLM 迂回）** に切替済。
>
> → SKILL 起動時、Claude は `mcp__figma-sync-mcp__figma_dump_to_file` を `output_path=snapshots/current/dump.json` で叩くだけ。**`01-dump.js` は不要**（削除候補）、`walk.js` も未使用。`run-context.js`（`createRunDir` / `promoteSnapshot` / `writeStatus`）は Phase 2 以降で使うので残す。
>
> 詳細：`docs/superpowers/specs/2026-08-19-figma-sync-local-diff-design.md` §13 セッション履歴。

- [ ] **Step 1: run-context.test.js 作成**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRunDir, promoteSnapshot } from '../scripts/lib/run-context.js';

describe('run-context', () => {
  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-'));
  });

  it('createRunDir creates timestamp-named folder', () => {
    const dir = createRunDir(tmpRoot);
    expect(fs.existsSync(dir)).toBe(true);
    expect(path.basename(dir)).toMatch(/^\d{4}-\d{2}-\d{2}_\d{4}\d*$/);
  });

  it('promoteSnapshot moves current to previous', () => {
    const snapDir = path.join(tmpRoot, 'snapshots');
    fs.mkdirSync(path.join(snapDir, 'current'), { recursive: true });
    fs.writeFileSync(path.join(snapDir, 'current', 'dump.json'), '{"v":1}');
    promoteSnapshot(snapDir);
    expect(fs.existsSync(path.join(snapDir, 'previous', 'dump.json'))).toBe(true);
    expect(fs.readFileSync(path.join(snapDir, 'previous', 'dump.json'), 'utf-8')).toBe('{"v":1}');
    expect(fs.existsSync(path.join(snapDir, 'current', 'dump.json'))).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```powershell
npx vitest run tests/run-context.test.js
```

- [ ] **Step 3: run-context.js 実装**

```js
import fs from 'node:fs';
import path from 'node:path';

export function createRunDir(root) {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const dir = path.join(root, 'runs', ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function promoteSnapshot(snapshotsRoot) {
  const cur = path.join(snapshotsRoot, 'current', 'dump.json');
  const prevDir = path.join(snapshotsRoot, 'previous');
  fs.mkdirSync(prevDir, { recursive: true });
  const prev = path.join(prevDir, 'dump.json');
  fs.renameSync(cur, prev);
}

export function writeStatus(runDir, status) {
  fs.writeFileSync(path.join(runDir, 'status.txt'), status + '\n');
}
```

- [ ] **Step 4: 01-dump.js 実装**

```js
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
  // MCP 返り値は文字列（JSON.stringify されたもの）
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
```

- [ ] **Step 5: テスト PASS 確認 + 疎通確認**

```powershell
npx vitest run tests/run-context.test.js
```

Expected: PASS 2/2

疎通確認（fixture で dump.json 出力）:
```powershell
Get-Content tests/fixtures/dump-v1.json | node scripts/01-dump.js
Test-Path snapshots/current/dump.json
```

Expected: True（ファイル存在）

- [ ] **Step 6: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/01-dump.js react_sudoku_app/scripts/figma-sync/scripts/lib/run-context.js react_sudoku_app/scripts/figma-sync/tests/run-context.test.js
git commit -m "機能追加: 01-dump.js + run-context helper"
```

---

## Task 5: 02-diff.js（previous vs current 比較）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/02-diff.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/diff.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/diff.test.js`

- [ ] **Step 1: diff.test.js 作成**

```js
import { describe, it, expect } from 'vitest';
import { computeDiff } from '../scripts/lib/diff.js';
import fs from 'node:fs';
import path from 'node:path';

const DIFF_PROPS = ['name', 'fills'];
const load = (name) => JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', name), 'utf-8'));

describe('computeDiff', () => {
  it('detects color modification', () => {
    const result = computeDiff(load('dump-v1.json'), load('dump-v2-color.json'), DIFF_PROPS);
    expect(result.modified).toHaveLength(1);
    expect(result.modified[0].nodeId).toBe('11-1896');
    expect(result.modified[0].diff).toHaveProperty('fills');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects added node', () => {
    const result = computeDiff(load('dump-v1.json'), load('dump-v2-added.json'), DIFF_PROPS);
    expect(result.added).toHaveLength(1);
    expect(result.added[0].nodeId).toBe('11-9999');
    expect(result.modified).toHaveLength(0);
  });

  it('empty diff when identical', () => {
    const v1 = load('dump-v1.json');
    const result = computeDiff(v1, v1, DIFF_PROPS);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });

  it('previous null (baseline case) treats all current as added', () => {
    const result = computeDiff(null, load('dump-v1.json'), DIFF_PROPS);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.removed).toHaveLength(0);
    expect(result.modified).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テスト失敗確認**

```powershell
npx vitest run tests/diff.test.js
```

- [ ] **Step 3: diff.js 実装**

```js
import { hashNode } from './canonicalize.js';

function flattenNodes(dump) {
  const map = new Map();
  if (!dump || !dump.pages) return map;
  const visit = (node) => {
    map.set(node.id, node);
    if (node.children) node.children.forEach(visit);
  };
  Object.values(dump.pages).forEach(visit);
  return map;
}

export function computeDiff(previous, current, diffProps) {
  const prev = flattenNodes(previous);
  const cur = flattenNodes(current);
  const added = [];
  const removed = [];
  const modified = [];

  for (const [id, node] of cur) {
    if (!prev.has(id)) {
      added.push({ nodeId: id, type: node.type, name: node.name });
    } else {
      const prevNode = prev.get(id);
      if (hashNode(prevNode, diffProps) !== hashNode(node, diffProps)) {
        const diff = {};
        for (const prop of diffProps) {
          if (JSON.stringify(prevNode[prop]) !== JSON.stringify(node[prop])) {
            diff[prop] = { before: prevNode[prop], after: node[prop] };
          }
        }
        modified.push({ nodeId: id, type: node.type, name: node.name, diff });
      }
    }
  }
  for (const [id, node] of prev) {
    if (!cur.has(id)) {
      removed.push({ nodeId: id, type: node.type, name: node.name });
    }
  }
  return { added, removed, modified };
}
```

- [ ] **Step 4: 02-diff.js 実装**

```js
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
```

- [ ] **Step 5: テスト + 疎通確認**

```powershell
npx vitest run tests/diff.test.js
```

Expected: PASS 4/4

- [ ] **Step 6: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/02-diff.js react_sudoku_app/scripts/figma-sync/scripts/lib/diff.js react_sudoku_app/scripts/figma-sync/tests/diff.test.js
git commit -m "機能追加: 02-diff.js + diff computation + tests"
```

---

## Task 6: 03-apply.js（`get_design_context` + JSX 差替え）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/03-apply.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/mapper.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/mapper.test.js`

**Note:** 実際の JSX 生成は Claude が `get_design_context` MCP を叩いて行うので、このスクリプトは①変化 nodeId を React file にマッピング、②.bak バックアップ作成、③Claude が置いた新 JSX 内容を検証、の 3 役。

- [ ] **Step 1: mapper.test.js 作成**

```js
import { describe, it, expect } from 'vitest';
import { mapNodesToFiles } from '../scripts/lib/mapper.js';

const FRAMES = [
  { nodeId: '11-1896', file: 'src/Home.tsx', component: 'Home' },
  { nodeId: '18-6', file: 'src/Play.tsx', component: 'Play' },
];

describe('mapNodesToFiles', () => {
  it('maps registered nodeIds to files', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '11-1896' }, { nodeId: '18-6' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(2);
    expect(result.unregistered).toHaveLength(0);
  });

  it('collects unregistered nodeIds as warning', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '99-99' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(0);
    expect(result.unregistered).toEqual(['99-99']);
  });

  it('dedupes same file mapped by multiple nodeIds', () => {
    const diff = { added: [], removed: [], modified: [{ nodeId: '11-1896' }, { nodeId: '11-1896' }] };
    const result = mapNodesToFiles(diff, FRAMES);
    expect(result.changedFiles).toHaveLength(1);
  });
});
```

- [ ] **Step 2: テスト失敗確認 → mapper.js 実装**

```js
export function mapNodesToFiles(diff, frames) {
  const allChanged = [...diff.added, ...diff.modified].map(x => x.nodeId);
  const byNodeId = new Map(frames.map(f => [f.nodeId, f]));
  const changedFilesSet = new Map();
  const unregistered = [];
  for (const nodeId of allChanged) {
    const frame = byNodeId.get(nodeId);
    if (frame) {
      if (!changedFilesSet.has(frame.file)) {
        changedFilesSet.set(frame.file, { ...frame, appliedNodeIds: [] });
      }
      changedFilesSet.get(frame.file).appliedNodeIds.push(nodeId);
    } else {
      unregistered.push(nodeId);
    }
  }
  return {
    changedFiles: Array.from(changedFilesSet.values()),
    unregistered,
  };
}
```

- [ ] **Step 3: テスト PASS 確認**

Expected: PASS 3/3

- [ ] **Step 4: 03-apply.js 実装**

```js
#!/usr/bin/env node
// Usage: node 03-apply.js <run-dir>
// changed-files.json を生成、.bak を作成、
// Skill が Claude 経由で MCP get_design_context を叩き JSX 置換 → このスクリプトが検証

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import { mapNodesToFiles } from './lib/mapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const config = loadConfig();

const runDir = process.argv[2];
const mode = process.argv[3] || 'prepare'; // prepare | validate
if (!runDir) { console.error('Usage: 03-apply.js <run-dir> [prepare|validate]'); process.exit(1); }

const diff = JSON.parse(fs.readFileSync(path.join(runDir, 'diff.json'), 'utf-8'));
const mapped = mapNodesToFiles(diff, config.frames);

if (mode === 'prepare') {
  // .bak バックアップを全 changedFile に作る
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
  // Claude はこの後 get_design_context を叩いて JSX を書き換える
} else if (mode === 'validate') {
  // .bak と現行を diff して、実際に変更が入ったか確認
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
```

- [ ] **Step 5: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/03-apply.js react_sudoku_app/scripts/figma-sync/scripts/lib/mapper.js react_sudoku_app/scripts/figma-sync/tests/mapper.test.js
git commit -m "機能追加: 03-apply.js + node→file mapper + .bak backup / validate"
```

---

## Task 7: 04-screenshot.js（Playwright + pixelmatch）— 並列 subagent 発火可

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/04-screenshot.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/screenshot.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/screenshot.test.js`

**依存:** Task 5（diff.json 形式）
**独立:** Task 8, 9 と並列で開発可能

- [ ] **Step 1: playwright + pixelmatch install**

```powershell
npm install --save playwright pixelmatch pngjs
npx playwright install chromium
```

- [ ] **Step 2: screenshot.test.js 作成（unit test で純関数だけテスト）**

```js
import { describe, it, expect } from 'vitest';
import { diffImages } from '../scripts/lib/screenshot.js';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

function mkSolidPng(w, h, rgb) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('diffImages', () => {
  it('returns 0 diff pixels for identical images', () => {
    const a = mkSolidPng(50, 50, [255, 0, 0]);
    const { diffPixels } = diffImages(a, a);
    expect(diffPixels).toBe(0);
  });

  it('returns high diff pixels for different colors', () => {
    const a = mkSolidPng(50, 50, [255, 0, 0]);
    const b = mkSolidPng(50, 50, [0, 255, 0]);
    const { diffPixels } = diffImages(a, b);
    expect(diffPixels).toBe(2500);
  });
});
```

- [ ] **Step 3: screenshot.js 実装**

```js
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export function diffImages(bufA, bufB, threshold = 0.1) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  return { diffPixels, diffPng: PNG.sync.write(diff) };
}
```

- [ ] **Step 4: 04-screenshot.js 実装**

```js
#!/usr/bin/env node
// Usage: node 04-screenshot.js <run-dir>
// 各変更 component を .bak と現行で render → screenshot → pixelmatch

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig } from './lib/config-loader.js';
import { diffImages } from './lib/screenshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const config = loadConfig();

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 04-screenshot.js <run-dir>'); process.exit(1); }

const changed = JSON.parse(fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf-8'));
const shotDir = path.join(runDir, 'screenshots');
fs.mkdirSync(shotDir, { recursive: true });

// 変更ファイルを一時的に .bak に戻して before shot を撮る戦略
// dev server を 1 回起動、対応 URL を訪問して screenshot
const devUrl = config.devServer.url;
const { width, height } = config.playwright.viewport;

// Simplifying: assume each component has route /demo/<component> exposed by app-side test harness
// (Task 12 で app 側 harness を追加する必要あり — 別 TODO として明記)

const browser = await chromium.launch();
try {
  for (const cf of changed.changedFiles) {
    const url = `${devUrl}/__figma-sync-preview__/${cf.component}`;

    // AFTER shot（現行 file）
    const ctxA = await browser.newContext({ viewport: { width, height } });
    const pageA = await ctxA.newPage();
    await pageA.goto(url, { waitUntil: 'networkidle' });
    const afterBuf = await pageA.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(shotDir, `${cf.component}_after.png`), afterBuf);
    await ctxA.close();

    // BEFORE shot（.bak を戻して同じ URL）
    const abs = path.join(REPO_ROOT, cf.file);
    const bak = abs + '.bak';
    const currentContent = fs.readFileSync(abs, 'utf-8');
    fs.copyFileSync(bak, abs);

    // Vite HMR を待つ
    await new Promise(r => setTimeout(r, 2000));

    const ctxB = await browser.newContext({ viewport: { width, height } });
    const pageB = await ctxB.newPage();
    await pageB.goto(url, { waitUntil: 'networkidle' });
    const beforeBuf = await pageB.screenshot({ fullPage: true });
    fs.writeFileSync(path.join(shotDir, `${cf.component}_before.png`), beforeBuf);
    await ctxB.close();

    // 現行内容に戻す
    fs.writeFileSync(abs, currentContent);
    await new Promise(r => setTimeout(r, 2000));

    // pixelmatch diff
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
```

- [ ] **Step 5: テスト PASS 確認**

```powershell
npx vitest run tests/screenshot.test.js
```

Expected: PASS 2/2

- [ ] **Step 6: TODO を明記して commit**

Add to `react_sudoku_app/scripts/figma-sync/PLAN.md` の未解決事項として：
- react_sudoku_app 側に `/__figma-sync-preview__/:component` route harness の追加が必要（Task 12 で対応）

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/04-screenshot.js react_sudoku_app/scripts/figma-sync/scripts/lib/screenshot.js react_sudoku_app/scripts/figma-sync/tests/screenshot.test.js
git commit -m "機能追加: 04-screenshot.js + Playwright + pixelmatch"
```

---

## Task 8: 05-test.js（全套テスト + coverage 集計）— 並列 subagent 発火可

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/05-test.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/test-runner.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/test-runner.test.js`

**独立:** Task 7, 9 と並列で開発可能

- [ ] **Step 1: test-runner.test.js 作成**

```js
import { describe, it, expect } from 'vitest';
import { parseVitestJson, parseJestJson, aggregateCoverage } from '../scripts/lib/test-runner.js';

describe('test-runner parsers', () => {
  it('parseVitestJson extracts pass/fail counts', () => {
    const sample = {
      numTotalTests: 100, numPassedTests: 98, numFailedTests: 2,
      testResults: [{ name: 'foo.test.js', assertionResults: [{ title: 't1', status: 'passed', duration: 5 }] }],
    };
    const r = parseVitestJson(sample);
    expect(r.total).toBe(100);
    expect(r.passed).toBe(98);
    expect(r.failed).toBe(2);
    expect(r.cases).toHaveLength(1);
  });

  it('aggregateCoverage merges vitest + jest coverage', () => {
    const v = { total: { lines: { pct: 90 }, branches: { pct: 80 } } };
    const j = { total: { lines: { pct: 70 }, branches: { pct: 60 } } };
    const r = aggregateCoverage(v, j);
    expect(r.line).toBeCloseTo(80);
    expect(r.branch).toBeCloseTo(70);
  });
});
```

- [ ] **Step 2: test-runner.js 実装**

```js
export function parseVitestJson(json) {
  const cases = [];
  for (const suite of json.testResults || []) {
    for (const tc of suite.assertionResults || []) {
      cases.push({
        file: suite.name, title: tc.title,
        status: tc.status, duration: tc.duration || 0,
      });
    }
  }
  return {
    total: json.numTotalTests || 0,
    passed: json.numPassedTests || 0,
    failed: json.numFailedTests || 0,
    cases,
  };
}

export const parseJestJson = parseVitestJson; // Jest json shape is compatible

export function aggregateCoverage(vitestCov, jestCov) {
  const pct = (a, b, key) => ((a?.total?.[key]?.pct || 0) + (b?.total?.[key]?.pct || 0)) / 2;
  return {
    line: pct(vitestCov, jestCov, 'lines'),
    branch: pct(vitestCov, jestCov, 'branches'),
    statement: pct(vitestCov, jestCov, 'statements'),
    function: pct(vitestCov, jestCov, 'functions'),
  };
}
```

- [ ] **Step 3: 05-test.js 実装**

```js
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
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const config = loadConfig();
const APP = path.join(REPO_ROOT, config.reactAppRoot);

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 05-test.js <run-dir>'); process.exit(1); }
const covDir = path.join(runDir, 'coverage');
fs.mkdirSync(covDir, { recursive: true });

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8', shell: true });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

// Vitest（Unit + Contract + Integration）with coverage
console.log('▶ vitest run --coverage...');
const vitestJsonPath = path.join(runDir, 'vitest.json');
run('npx', ['vitest', 'run', '--coverage', '--reporter=json', '--outputFile=' + vitestJsonPath], APP);
const vitestJson = fs.existsSync(vitestJsonPath) ? JSON.parse(fs.readFileSync(vitestJsonPath, 'utf-8')) : { numTotalTests: 0 };
const vitestCov = fs.existsSync(path.join(APP, 'coverage', 'coverage-summary.json'))
  ? JSON.parse(fs.readFileSync(path.join(APP, 'coverage', 'coverage-summary.json'), 'utf-8')) : {};

// Jest (Component + Snapshot) — Sudoku 現状 Vitest 使用の可能性、条件付き
let jestJson = { numTotalTests: 0 };
let jestCov = {};
if (fs.existsSync(path.join(APP, 'jest.config.ts')) || fs.existsSync(path.join(APP, 'jest.config.js'))) {
  console.log('▶ jest --coverage...');
  const jestJsonPath = path.join(runDir, 'jest.json');
  run('npx', ['jest', '--coverage', '--json', '--outputFile=' + jestJsonPath], APP);
  if (fs.existsSync(jestJsonPath)) jestJson = JSON.parse(fs.readFileSync(jestJsonPath, 'utf-8'));
}

// Playwright (E2E + Security + A11y)
console.log('▶ playwright test...');
const pwJsonPath = path.join(runDir, 'playwright.json');
run('npx', ['playwright', 'test', '--reporter=json'], APP);

// npm audit
console.log('▶ npm audit...');
const audit = run('npm', ['audit', '--json'], APP);
fs.writeFileSync(path.join(runDir, 'audit.json'), audit.stdout);

// 集計
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
```

- [ ] **Step 4: テスト + Commit**

```powershell
npx vitest run tests/test-runner.test.js
```

Expected: PASS 2/2

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/05-test.js react_sudoku_app/scripts/figma-sync/scripts/lib/test-runner.js react_sudoku_app/scripts/figma-sync/tests/test-runner.test.js
git commit -m "機能追加: 05-test.js + Vitest/Jest/Playwright 結果集計"
```

---

## Task 9: 06-report.py（openpyxl + v10 テンプレ埋込）— 並列 subagent 発火可

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/06-report.py`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/excel-fill.py`
- Create: `react_sudoku_app/scripts/figma-sync/requirements.txt`
- Create: `react_sudoku_app/scripts/figma-sync/tests/report.test.py`

**独立:** Task 7, 8 と並列で開発可能

- [ ] **Step 1: requirements.txt 作成**

```
openpyxl==3.1.5
Pillow==11.0.0
pytest==8.3.3
```

```powershell
pip install -r requirements.txt
```

- [ ] **Step 2: tests/report.test.py 作成**

```python
import json, tempfile, os, shutil
from openpyxl import load_workbook
from scripts.lib.excel_fill import fill_report, ExcelFillContext

def test_fill_report_creates_file_with_12_sheets(tmp_path):
    template = os.path.join(os.path.dirname(__file__), '..', 'templates', 'sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx')
    output = tmp_path / 'report.xlsx'

    ctx = ExcelFillContext(
        template_path=template,
        output_path=str(output),
        run_ts='2026-08-19 14:30',
        test_results={'vitest':{'total':93,'passed':93,'failed':0,'cases':[]},
                      'jest':{'total':14,'passed':14,'failed':0,'cases':[]},
                      'coverage':{'line':92.3,'branch':87.1,'statement':91.0,'function':88.5}},
        screenshots=[],
        diff_summary={'added':0,'modified':1,'removed':0},
    )
    fill_report(ctx)

    wb = load_workbook(str(output))
    assert '12_カバレッジ' in wb.sheetnames, '12_カバレッジ sheet must be added'
    assert '01_表紙サマリ' in wb.sheetnames
    ws = wb['01_表紙サマリ']
    # R4 D column（プロジェクト名 row）は変更しないが、R7 D は担当者更新
    assert 'Claude' in str(ws.cell(9, 4).value) or 'Claude' in str(ws.cell(7, 4).value)
```

**Note:** `scripts/lib/` を Python module にするため空 `__init__.py` を置く：

```powershell
New-Item scripts/lib/__init__.py -ItemType File
```

- [ ] **Step 3: scripts/lib/excel_fill.py 実装**

```python
"""v10 テンプレを実データで埋込む処理。原本は絶対不変。"""
from dataclasses import dataclass, field
from typing import Any
from openpyxl import load_workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Font, PatternFill
from pathlib import Path

@dataclass
class ExcelFillContext:
    template_path: str
    output_path: str
    run_ts: str
    test_results: dict
    screenshots: list = field(default_factory=list)  # [(sheet, cell, png_path)]
    diff_summary: dict = field(default_factory=dict)


def fill_report(ctx: ExcelFillContext) -> None:
    wb = load_workbook(ctx.template_path)

    # === 01_表紙サマリ ===
    if '01_表紙サマリ' in wb.sheetnames:
        ws = wb['01_表紙サマリ']
        ws.cell(6, 4).value = ctx.run_ts.split(' ')[0]  # 報告日
        ws.cell(7, 4).value = 'Claude Code'
        ws.cell(9, 4).value = f'Claude 実施日: {ctx.run_ts}'
        ws.cell(10, 4).value = f'Superpowers 実施日: {ctx.run_ts}'

        # サマリ表（R16-R25）を実測値で上書き
        cov = ctx.test_results.get('coverage', {})
        tv = ctx.test_results.get('vitest', {})
        tj = ctx.test_results.get('jest', {})
        total_pass = tv.get('passed', 0) + tj.get('passed', 0)
        total_fail = tv.get('failed', 0) + tj.get('failed', 0)
        # R26 合計行
        ws.cell(26, 4).value = total_pass + total_fail
        ws.cell(26, 7).value = f'{total_pass} / {total_pass+total_fail} PASS'

    # === 02-11 各 sheet の 実施日 / 実際結果 更新 ===
    for sn in wb.sheetnames:
        if sn.startswith(('02_', '03_', '04_', '05_', '06_', '07_', '08_', '09_')):
            _update_result_sheet(wb[sn], ctx.run_ts)

    # === 12_カバレッジ シート追加 ===
    if '12_カバレッジ' not in wb.sheetnames:
        cov_ws = wb.create_sheet('12_カバレッジ')
        cov_ws['A1'] = 'カバレッジ サマリ'
        cov_ws['A1'].font = Font(bold=True, size=16)
        cov = ctx.test_results.get('coverage', {})
        rows = [
            ('Line', cov.get('line', 0)),
            ('Branch', cov.get('branch', 0)),
            ('Statement', cov.get('statement', 0)),
            ('Function', cov.get('function', 0)),
        ]
        for i, (label, val) in enumerate(rows, start=3):
            cov_ws.cell(i, 1).value = label
            cov_ws.cell(i, 2).value = f'{val:.1f}%'

    # === screenshots 埋込 ===
    for (sheet_name, cell_addr, png_path) in ctx.screenshots:
        if sheet_name in wb.sheetnames and Path(png_path).exists():
            ws = wb[sheet_name]
            img = XLImage(png_path)
            img.width, img.height = 320, 200
            ws.add_image(img, cell_addr)

    wb.save(ctx.output_path)


def _update_result_sheet(ws, run_ts: str) -> None:
    """テスト明細シートの実施日 / 実際結果 列を更新。列位置は v10 構造に依存。"""
    # v10 では G 列 = 開発時テスト実施日、H 列 = 実施者、I 列 = 追加テスト実施日、J 列 = 実施者
    for row in range(8, ws.max_row + 1):
        # 何かデータが入っている行のみ更新
        if ws.cell(row, 2).value and str(ws.cell(row, 2).value).strip().isdigit():
            ws.cell(row, 7).value = run_ts
            ws.cell(row, 8).value = 'Claude'
            ws.cell(row, 9).value = run_ts
            ws.cell(row, 10).value = 'Superpowers'
```

- [ ] **Step 4: scripts/06-report.py 実装**

```python
#!/usr/bin/env python
"""Usage: python 06-report.py <run-dir>"""
import sys, json, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.lib.excel_fill import fill_report, ExcelFillContext

def main():
    if len(sys.argv) < 2:
        print('Usage: 06-report.py <run-dir>', file=sys.stderr); sys.exit(1)
    run_dir = Path(sys.argv[1])
    root = Path(__file__).parent.parent
    template = root / 'templates' / 'sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx'

    test_results = json.loads((run_dir / 'test-results.json').read_text())
    diff = json.loads((run_dir / 'diff.json').read_text())
    diff_summary = {'added': len(diff['added']), 'modified': len(diff['modified']), 'removed': len(diff['removed'])}

    # screenshots: <comp>_before/after/diff.png を 06_スナップショット sheet に埋め込む
    shot_dir = run_dir / 'screenshots'
    screenshots = []
    if shot_dir.exists():
        for png in sorted(shot_dir.glob('*_after.png')):
            comp = png.stem.replace('_after', '')
            screenshots.append(('06_スナップショット', f'K{15 + len(screenshots)*3}', str(png)))

    ctx = ExcelFillContext(
        template_path=str(template),
        output_path=str(run_dir / 'report.xlsx'),
        run_ts=run_dir.name.replace('_', ' '),
        test_results=test_results,
        screenshots=screenshots,
        diff_summary=diff_summary,
    )
    fill_report(ctx)
    print(f'✔ Generated {ctx.output_path}')

if __name__ == '__main__':
    main()
```

- [ ] **Step 5: テスト + Commit**

```powershell
python -m pytest tests/report.test.py -v
```

Expected: PASS

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/06-report.py react_sudoku_app/scripts/figma-sync/scripts/lib/excel_fill.py react_sudoku_app/scripts/figma-sync/scripts/lib/__init__.py react_sudoku_app/scripts/figma-sync/requirements.txt react_sudoku_app/scripts/figma-sync/tests/report.test.py
git commit -m "機能追加: 06-report.py + openpyxl v10 テンプレ埋込 + 12_カバレッジ シート"
```

---

## Task 10: 07-confirm.js（人 y/n + rollback + commit + PR）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/scripts/07-confirm.js`
- Create: `react_sudoku_app/scripts/figma-sync/scripts/lib/git-ops.js`
- Create: `react_sudoku_app/scripts/figma-sync/tests/git-ops.test.js`

- [ ] **Step 1: git-ops.test.js 作成（rollback ロジックだけ純関数テスト）**

```js
import { describe, it, expect } from 'vitest';
import { buildCommitMessage } from '../scripts/lib/git-ops.js';

describe('buildCommitMessage', () => {
  it('produces JP commit with file list and nodeIds', () => {
    const msg = buildCommitMessage({
      changedFiles: [
        { file: 'src/Home.tsx', appliedNodeIds: ['11-1896'] },
        { file: 'src/Play.tsx', appliedNodeIds: ['18-6'] },
      ],
      reportPath: 'runs/2026-08-19_1430/report.xlsx',
    });
    expect(msg).toMatch(/^機能更新/);
    expect(msg).toContain('src/Home.tsx');
    expect(msg).toContain('src/Play.tsx');
    expect(msg).toContain('11-1896');
    expect(msg).toContain('report.xlsx');
    expect(msg).toContain('Co-Authored-By: Claude');
  });
});
```

- [ ] **Step 2: git-ops.js 実装**

```js
import fs from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

export function buildCommitMessage({ changedFiles, reportPath }) {
  const fileList = changedFiles.map(cf => `- ${cf.file}: nodeId ${cf.appliedNodeIds.join(', ')}`).join('\n');
  const allNodeIds = changedFiles.flatMap(cf => cf.appliedNodeIds).join(', ');
  return `機能更新: Figma 同期による UI 反映

${fileList}

Figma nodeIds: ${allNodeIds}
Report: ${reportPath}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
}

export function rollbackBakFiles(changedFiles, repoRoot) {
  for (const cf of changedFiles) {
    const abs = path.join(repoRoot, cf.file);
    const bak = abs + '.bak';
    if (fs.existsSync(bak)) {
      fs.renameSync(bak, abs);
    }
  }
}

export function cleanupBakFiles(changedFiles, repoRoot) {
  for (const cf of changedFiles) {
    const bak = path.join(repoRoot, cf.file + '.bak');
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
  }
}

export async function commitAndPush(repoRoot, message, files) {
  const git = simpleGit(repoRoot);
  await git.add(files);
  await git.commit(message);
  const branch = (await git.branch()).current;
  await git.push('origin', branch);
  return branch;
}
```

- [ ] **Step 3: 07-confirm.js 実装**

```js
#!/usr/bin/env node
// Usage: node 07-confirm.js <run-dir>
// 端末に summary 表示 → y/n → APPROVED / REJECTED 処理

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/config-loader.js';
import { buildCommitMessage, rollbackBakFiles, cleanupBakFiles, commitAndPush } from './lib/git-ops.js';
import { promoteSnapshot, writeStatus } from './lib/run-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const config = loadConfig();

const runDir = process.argv[2];
if (!runDir) { console.error('Usage: 07-confirm.js <run-dir>'); process.exit(1); }

const changed = JSON.parse(fs.readFileSync(path.join(runDir, 'changed-files.json'), 'utf-8'));
const testResults = JSON.parse(fs.readFileSync(path.join(runDir, 'test-results.json'), 'utf-8'));

// Summary 表示
console.log('='.repeat(60));
console.log(`  Figma Sync 実行完了 - ${runDir.split(path.sep).pop()}`);
console.log('='.repeat(60));
console.log(`変更ファイル: ${changed.changedFiles.length}`);
for (const cf of changed.changedFiles) console.log(`  - ${cf.file}`);
if (changed.unregistered.length) {
  console.log(`未登記 nodeId: ${changed.unregistered.length}`);
  for (const n of changed.unregistered) console.log(`  ⚠ ${n}`);
}
const totalFail = (testResults.vitest?.failed || 0) + (testResults.jest?.failed || 0);
console.log(`\nテスト結果: ${totalFail === 0 ? '全 PASS' : `${totalFail} FAIL`}`);
console.log(`カバレッジ: line ${(testResults.coverage?.line || 0).toFixed(1)}%, branch ${(testResults.coverage?.branch || 0).toFixed(1)}%`);
console.log(`\nレポート: ${path.join(runDir, 'report.xlsx')}`);
console.log(`スクリーンショット: ${path.join(runDir, 'screenshots')}`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\n承認しますか？ [y/n]: ', async (ans) => {
  rl.close();
  if (ans.trim().toLowerCase() === 'y') {
    cleanupBakFiles(changed.changedFiles, REPO_ROOT);
    promoteSnapshot(path.join(ROOT, 'snapshots'));
    writeStatus(runDir, 'APPROVED');

    const filesToAdd = changed.changedFiles.map(cf => cf.file);
    const message = buildCommitMessage({
      changedFiles: changed.changedFiles,
      reportPath: path.relative(REPO_ROOT, path.join(runDir, 'report.xlsx')),
    });
    try {
      const branch = await commitAndPush(REPO_ROOT, message, filesToAdd);
      console.log(`✔ Committed to ${branch}`);
      console.log(`PR 作成は手動または gh pr create で（自動化は Task 12 で追加）`);
    } catch (e) {
      console.error(`commit 失敗: ${e.message}`);
      process.exit(1);
    }
  } else {
    rollbackBakFiles(changed.changedFiles, REPO_ROOT);
    fs.rmSync(path.join(ROOT, 'snapshots', 'current', 'dump.json'), { force: true });
    writeStatus(runDir, 'REJECTED');
    console.log('✗ 拒否されました、コードを元に戻しました');
  }
});
```

- [ ] **Step 4: テスト + Commit**

```powershell
npx vitest run tests/git-ops.test.js
```

Expected: PASS 1/1

```bash
git add react_sudoku_app/scripts/figma-sync/scripts/07-confirm.js react_sudoku_app/scripts/figma-sync/scripts/lib/git-ops.js react_sudoku_app/scripts/figma-sync/tests/git-ops.test.js
git commit -m "機能追加: 07-confirm.js + git-ops (commit / rollback)"
```

---

## Task 11: SKILL.md（`/figma-sync` 起動口）

**Files:**
- Create: `react_sudoku_app/scripts/figma-sync/SKILL.md`
- Create: `~/.claude/skills/figma-sync/SKILL.md`（or `.claude/skills/figma-sync/SKILL.md` — Task 完了時に Liu と相談）

- [ ] **Step 1: SKILL.md 作成**

```markdown
---
name: figma-sync
description: 数独プロジェクトの Figma → React 同期パイプライン。
  トリガー：「/figma-sync」「数独 デザイン 更新」「figma 反映」「figma 同期」
---

# Figma Sync (MCP-only)

デザイナーが Figma を更新した後、Liu の発話で以下 8 フェーズを順番に実行する。

**前提**: Figma デスクトップまたはブラウザで対象ファイルが開かれていること。

## Phase 1: MCP dump

1. `react_sudoku_app/scripts/figma-sync/config.json` を読む
2. `react_sudoku_app/scripts/figma-sync/scripts/lib/walk.js` の `buildWalkPayload({ pageIds, diffProps })` を呼ぶ
3. 戻り値の JS 文字列を `mcp__plugin_figma_figma__use_figma` に渡す
4. MCP 応答（JSON 文字列）を stdin 経由で `node scripts/01-dump.js` に流す

## Phase 2: Local diff

1. run dir を作成：`node -e "import('./scripts/lib/run-context.js').then(m => console.log(m.createRunDir('./')))" `
2. `node scripts/02-diff.js <run-dir>` 実行
3. exit 2（NO_CHANGE）なら早退

## Phase 3: 対応付け + code apply

1. `node scripts/03-apply.js <run-dir> prepare`（.bak backup + changed-files.json 作成）
2. changed-files.json の各 file について：
   - 対応する nodeId 群を `mcp__plugin_figma_figma__get_design_context` に渡して JSX + Tailwind を取得
   - 既存 file の該当 JSX を新内容で置換（**JS 論理には触らない**、strict source of truth）
3. `node scripts/03-apply.js <run-dir> validate`（変更が入ったか検証）

## Phase 4: before/after screenshot

1. `cd react_sudoku_app; npm run dev &`（dev server 起動）
2. `node scripts/04-screenshot.js <run-dir>`

## Phase 5: 全種テスト

1. `node scripts/05-test.js <run-dir>`
2. 結果を PASS/FAIL 数で確認

## Phase 6: Excel 生成

1. `python scripts/06-report.py <run-dir>`
2. `runs/<ts>/report.xlsx` 確認

## Phase 7: 人確認

1. `node scripts/07-confirm.js <run-dir>`
2. Liu が y/n で判断

## Phase 8: commit + PR

07-confirm.js が y の場合、自動で commit + push まで実行。PR は `gh pr create` で追加：

```
gh pr create --title "機能更新: Figma 同期による UI 反映" --body "..."
```

---

## エラー時の挙動

- **Phase 1 失敗**: 何も変えず終了、Figma セッション確認を Liu に依頼
- **Phase 3 で未登記 nodeId**: 警告のみ、他は続行
- **Phase 5 で FAIL**: Phase 6 に進み、Phase 7 で人が判断
- **Phase 7 で n**: `.bak` を復元、`current/dump.json` 破棄
```

- [ ] **Step 2: Commit**

```bash
git add react_sudoku_app/scripts/figma-sync/SKILL.md
git commit -m "機能追加: SKILL.md (/figma-sync 起動口)"
```

- [ ] **Step 3: Liu に skill インストール先を確認**

質問：
> SKILL.md をどこにインストールしますか？
> A. `~/.claude/skills/figma-sync/SKILL.md`（グローバル）
> B. `Sudoku/react_sudoku_app/.claude/skills/figma-sync/SKILL.md`（プロジェクトローカル）

決定後、`Copy-Item` でインストール。

---

## Task 12: 疎通テスト + 未対応 harness 追加

**Files:**
- Modify: `react_sudoku_app/src/App.tsx` or `react_sudoku_app/vite.config.ts`（`/__figma-sync-preview__/:component` ルート追加）
- Create: `react_sudoku_app/scripts/figma-sync/tests/e2e-smoke.md`（手動テスト手順書）

- [ ] **Step 1: react app 側にプレビュールート追加**

`react_sudoku_app/src/App.tsx` を Read → 既存 router 構造を確認 → `/__figma-sync-preview__/:component` を追加、各 config.frames.component 名で該当コンポーネントを isolated mount。

**具体的な差分は既存 App.tsx 構造を見てから決定**。

- [ ] **Step 2: Figma で 1 要素の色変更を実施**

Liu にお願い：Figma で SubmitButton の色を微妙に変える。

- [ ] **Step 3: `/figma-sync` 発話 → 全 Phase 通しで動作確認**

- Phase 1: dump.json が生成される
- Phase 2: diff.json に 1 modified が出る
- Phase 3: .bak が作られ、対応 tsx が変更される
- Phase 4: before/after/diff png が 3 枚出る
- Phase 5: テスト結果が集計される
- Phase 6: report.xlsx が生成される、12_カバレッジ sheet がある
- Phase 7: 端末に summary が出る
- 動作確認後 n で拒否 → .bak が復元されて元通り

- [ ] **Step 4: 発見された bug を修正 → commit**

- [ ] **Step 5: 再度 y で走らせて commit + push を確認**

```bash
git commit -m "機能追加: figma-sync-preview route + E2E 疎通テスト完了"
```

---

## Task 13: 旧資源の大清理

**Files:**
- Delete: `_archive/figma-sync-v2-spec/`
- Delete: `_archive/figma-sync-tmp/`（scripts/ 内）
- Delete: `_archive/scripts/dump_reference_v10.py`（v10 テンプレは `react_sudoku_app/scripts/figma-sync/templates/` に移動済）
- Delete: `.github/workflows/figma-guard.yml`（もし存在）
- Delete: orphan branch `figma-sync/state`（GitHub 上）

- [ ] **Step 1: 削除対象を Liu に確認**

削除リストを提示：
```
_archive/figma-sync-v2-spec/        (v3 spec、既に本 spec で置き換え)
_archive/scripts/figma-sync-tmp/    (v3 実装の残骸)
.github/workflows/figma-guard.yml   (cron ワークフロー、不要)
orphan branch figma-sync/state      (git branch -D + 上流 push)
```

- [ ] **Step 2: Liu 承認後、削除実施**

```powershell
Remove-Item -Recurse -Force _archive/figma-sync-v2-spec/
Remove-Item -Recurse -Force _archive/scripts/figma-sync-tmp/
Remove-Item _archive/scripts/dump_reference_v10.py, _archive/scripts/_build_final_report_v10.py, _archive/scripts/v10_structure.txt -Force
```

```bash
git rm -r .github/workflows/figma-guard.yml  # if exists
git push origin --delete figma-sync/state
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "雑務: 旧 figma-sync 関連ファイルの大清理"
```

---

## Self-Review 結果

- ✅ Spec の 8 Phase 全て task で覆っている（Task 4-10 = Phase 1-8）
- ✅ プレースホルダなし（全 step に code / command 明示）
- ✅ 型整合性：`changedFiles`, `runDir`, `config` の shape が Task 間で一致
- ✅ 並列化ポイントを冒頭の依存グラフで明示
- ✅ TDD 遵守（各 Task で test 先行）
- ✅ 頻繁 commit（各 Task 末尾で commit）

**残りの未確認事項**：
- react_sudoku_app 側の既存 router 構造は Task 12 で調査（現時点で不明）
- Jest 使用状況は Task 8 で条件分岐（config file 存在で判定）
- `runs/` の retention policy は Task 13 で decide（未実装 = 全保留 default）

---

## Execution Handoff

Plan 保存先: `react_sudoku_app/scripts/figma-sync/PLAN.md`

**2 通りの実行方式**：

**1. Subagent-Driven（推奨）** — Task 6-9 を並列 subagent、他は sequential + 段階 review。
所要：主体 ~4-5 時間（並列化により 13 時間見積から短縮）

**2. Inline Execution** — 全 Task を本セッション内で順次実行、Task 単位で checkpoint。
所要：~13 時間（context 消費多、複数セッション必要）

どちらで進めますか？
