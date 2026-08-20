> **⚠️ DEPRECATED**: 本 v3 SPEC/PLAN は自作 MCP 依存で廃止。v4 の SPEC は
> `docs/superpowers/specs/2026-08-21-figma-sync-v4-spec.md` を参照。

# Figma → React 同期 仕様書

**作成日**: 2026-08-19
**根目録**: `_archive/figma-sync-mcp/`

---

## 1. コア設計思想

- **2-MCP 構成**（2026-08-20 実装）：
  - **公式** `plugin:figma:figma`（リモート HTTP）→ Phase 3 の code apply（`get_design_context` で node 単位 JSX 生成）
  - **自作** `figma-sync-mcp`（本地 stdio、`C:\Users\admin\mcp-servers\figma-sync-mcp\server.mjs`）→ Phase 1 の全量 dump（REST → disk 直書き、LLM context を bypass、25K token 截断を回避）
- **ローカル完結**：全量ダンプはローカルフォルダに置く、DB 不要
- **strict source of truth**：Figma に有るものだけ React に反映、逆方向の合成禁止
- **人確認 gate**：全 Phase 通ったあと必ず y/n 確認、n なら完全ロールバック
- **報告書 = v10 テンプレ踏襲**：既存 Excel 雛形の 11 sheet + 新 12_カバレッジ sheet を実データで埋める

---

## 2. 全体流れ（8 Phase）

```
[起動]
  ↓ 人発話「/figma-sync」（Figma セッション起動必須）
[Phase 1] MCP dump
  ↓ 全量 tree JSON → snapshots/current/dump.json
[Phase 2] Local diff
  ↓ previous vs current → runs/<ts>/diff.json
  ├─ 空 diff → 早退
[Phase 3] 映射 + code apply
  ↓ nodeId → React file、.bak バックアップ、JSX/className 修正
[Phase 4] before/after screenshot
  ↓ Playwright + pixelmatch
[Phase 5] 全套テスト実行
  ↓ Vitest + Jest + Playwright + axe + coverage
[Phase 6] Excel 生成
  ↓ v10 テンプレ → runs/<ts>/report.xlsx
[Phase 7] 人確認 y/n
  ├─ y → Phase 8
  └─ n → rollback → 終了
[Phase 8] Snapshot 昇格 + commit + PR
  ↓ current → previous、日本語 commit + PR
[完了]
```

> **将来対応（本仕様書 v1 では対象外）**：デザイナーが Figma ノードに書いた「指示テキスト」（コメント / Dev Mode Annotation / レイヤー名記法）を追加の入力として受け取り、JSX 変更に反映する。詳細は付録 A 参照。

---

## 3. ディレクトリ構成

```
_archive/figma-sync-mcp/
├── SPEC.md                          ← 本ファイル
├── SKILL.md                         ← /figma-sync 起動口
├── config.json                      ← node→file マッピング
├── scripts/
│   ├── 01-dump.js                   ← MCP use_figma walk 用 JS
│   ├── 02-diff.js                   ← previous vs current 比較
│   ├── 03-apply.js                  ← React ファイル修正 + .bak
│   ├── 04-screenshot.js             ← Playwright screenshot + pixelmatch
│   ├── 05-test.js                   ← 全套テスト実行 + coverage 集計
│   ├── 06-report.js                 ← openpyxl で v10 テンプレ埋込
│   ├── 07-confirm.js                ← 端末 y/n → rollback or commit
│   └── lib/
│       ├── walk.js                  ← use_figma に渡す JS
│       ├── canonicalize.js          ← JSON 正規化
│       └── excel-fill.py            ← openpyxl 処理
├── snapshots/
│   ├── previous/dump.json           ← 前回 dump（diff 基準）
│   └── current/dump.json            ← 今回 dump
├── runs/
│   └── 2026-08-19_1430/
│       ├── diff.json
│       ├── changed-files.json
│       ├── screenshots/
│       │   ├── <component>_before.png
│       │   ├── <component>_after.png
│       │   └── <component>_diff.png
│       ├── test-results.json
│       ├── coverage/
│       │   ├── vitest/
│       │   ├── jest/
│       │   └── summary.json
│       ├── report.xlsx
│       └── status.txt               ← APPROVED / REJECTED / NO_CHANGE
└── templates/
    └── sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx  ← read-only
```

---

## 4. Phase 詳細

### Phase 1 — MCP dump

**目的**：Figma file 全体を 1 回で取得、`snapshots/current/dump.json` に落とす

**手順**（2026-08-20 実装、自作 MCP 経由）：
1. SKILL から Claude に `mcp__figma-sync-mcp__figma_dump_to_file` を叩かせる
2. 渡す引数：
   ```json
   {
     "file_key": "cwmewA4MTWktw6E7uhQFK2",
     "output_path": "C:\\...\\react_sudoku_app\\scripts\\figma-sync\\snapshots\\current\\dump.json"
   }
   ```
3. 自作 MCP が内部で `GET https://api.figma.com/v1/files/:key` を叩き、raw JSON を `output_path` に直接書き出す（LLM context を通さない）
4. Claude 側の受信は 148 bytes の status のみ：
   ```json
   {"status":"ok","path":"...","size_bytes":5095429,"node_count":18026,"endpoint":"file"}
   ```
5. `snapshots/current/dump.json` は Figma REST 生の JSON（`{document: {...}, components, styles, ...}` の完全 payload、~5MB）

**前提**：
- `.claude.json` に `figma-sync-mcp` サーバー登録済（user scope）
- `FIGMA_PERSONAL_ACCESS_TOKEN` が MCP env block に設定済
- Figma Desktop / ブラウザ session は**不要**（REST は headless で動く）

**Claude 呼び出し**：1（重い、数秒〜十数秒、実測 ~10 秒）

**旧計画からの変更**：当初は公式 `mcp__plugin_figma_figma__use_figma` に `walk.js` を渡して全 tree を LLM 経由で取得する計画だったが、MCP result の 25K token 制限（≈ 80 KB）に対し実データは 5 MB / ~1.5M tokens で通過不能。→ 自作 MCP で REST + disk 直書きに切替、LLM を伝送レイヤーから外した。`scripts/lib/walk.js` は**未使用**（削除候補）。

---

### Phase 2 — Local diff

**目的**：previous と current を比較して変化ノードを取り出す

**手順**：
1. `snapshots/previous/dump.json` を読む（初回は空）
2. `snapshots/current/dump.json` を読む
3. 両ツリーを nodeId ベースで走査：
   - **added**：current にのみ存在
   - **removed**：previous にのみ存在
   - **modified**：両方に存在、監視属性が違う
4. 監視属性：`name / fills / strokes / effects / opacity / characters / style / boundVariables`
5. 結果 JSON：
   ```json
   {
     "added":    [{ "nodeId": "...", "type": "...", "name": "..." }],
     "removed":  [{ "nodeId": "...", "type": "...", "name": "..." }],
     "modified": [{ "nodeId": "...", "diff": { "fills": {before, after} } }]
   }
   ```
6. `runs/<ts>/diff.json` に保存
7. 全リスト空 → 早退（`status.txt = NO_CHANGE`）

**Claude 呼び出し**：0

---

### Phase 3 — 映射 + code apply

**目的**：変化 nodeId → React ファイル、修正実施

**手順**：
1. `config.json` の `frames` を読む：
   ```json
   {
     "frames": [
       { "nodeId": "11-1896", "file": "src/screens/Home.tsx", "component": "Home" },
       { "nodeId": "18-6",    "file": "src/screens/Play.tsx", "component": "Play" }
     ]
   }
   ```
2. 変化 nodeId ∩ 登記 frame → `changed-files.json`
3. 未登記の変化 nodeId → 警告として記録（PR body に載せる、code は触らない）
4. 変化 file ごとに：
   - `cp file.tsx file.tsx.bak`
   - Claude に `mcp__plugin_figma_figma__get_design_context` を叩かせて変化 nodeId の JSX + Tailwind 生成
   - 生成物で `file.tsx` を上書き
   - **変更対象**：JSX / className / トークン参照 のみ
   - **禁止**：JS 論理、hook、state、非表示ロジックへの介入
5. strict source of truth 原則違反（Figma に無い要素の追加、i18n integrity 補正 等）は禁止

**Claude 呼び出し**：変化ファイル数

---

### Phase 4 — before/after screenshot

**目的**：変化 component 単位で描画差分を可視化

**手順**：
1. Vite dev server 起動
2. 各変化 component について：
   1. `file.tsx.bak` の内容で一時 mount ページを組み立て → Playwright で screenshot → `<comp>_before.png`
   2. 現行 `file.tsx` で mount → screenshot → `<comp>_after.png`
   3. `pixelmatch(before, after)` → `<comp>_diff.png` + 差異ピクセル数
3. 結果を `runs/<ts>/screenshots/` に保存
4. component が page 全体の場合は viewport 1440×900 の full page shot、部品なら isolated mount

**技術**：Playwright + `pixelmatch` + `pngjs`

---

### Phase 5 — 全套テスト実行

**目的**：v10 テンプレ 181 件 + coverage を実測で埋める

**実行コマンド**：
```bash
npm run test:unit -- --coverage      # Vitest (Unit 93 + Contract 19 + Integration 3)
npm run test:component               # Jest + RTL (Component 14 + Snapshot 6)
npm run test:e2e                     # Playwright (E2E 5 + Security 9 + A11y 3)
npm audit --json > audit.json        # インフラ・依存脆弱性 19
```

**Android 実機テスト（v10 sheet 11）**：
- 自動化不能 → `status.txt` に「Android SKIPPED（要手動）」を明記
- Excel は該当 sheet を「未実施」で埋める（`config.json.androidPolicy` で切替可能）

**成果物**：
- `test-results.json`：per-case pass/fail + duration
- `coverage/summary.json`：line/branch/statement/function %
- `coverage/vitest/lcov.info`、`coverage/jest/lcov.info`

**検証**：
- 各 npm script の exit code + stdout を必ず確認してから「PASS」と扱う
- fail 件数 > 0 でも Phase 6 に進む（人が Phase 7 で判断）

---

### Phase 6 — Excel 生成

**入力**：
- `templates/sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx`（read-only）
- `runs/<ts>/test-results.json`、`coverage/summary.json`、`screenshots/`、`diff.json`

**手順**：
1. `openpyxl.load_workbook(template)` で開く
2. **表紙シート（01_表紙サマリ）**：
   - R4-R12：本次実行日時、担当者「Claude Code」、本番 URL 等を更新
   - R16-R25：各 sheet の実測件数 + PASS/FAIL 数 + 結果ラベル
   - R28 下：dev server で撮った「総合実行結果 スクリーンショット」を埋込
3. **02-11 各 sheet**：
   - 「実施日」列 → 本次日時
   - 「実際結果」列 → 実測結果（OK / NG + 詳細）
   - 「開発時テスト」実施者 → 「Claude」
   - 「追加テスト」実施者 → 「Superpowers」
   - 既存嵌入图 → 保留（履歴参考）
   - 本次新截图 → 各 sheet 现有图区の下に追加
4. **06_スナップショット sheet**：before/after/diff 3 張ずつ横排追加
5. **新規 sheet「12_カバレッジ」**：
   - Vitest / Jest per-file coverage table（line/branch/statement/function %）
   - 全体サマリ
   - 未 cover ファイル一覧
6. 保存先：`runs/<ts>/report.xlsx`（テンプレ本体は絶対不変）

**技術**：Python + openpyxl + Pillow

---

### Phase 7 — 人確認

**端末表示例**：
```
============================================================
  Figma Sync 実行完了 - 2026-08-19 14:30
============================================================
変更ファイル：3
  - src/screens/Home.tsx
  - src/screens/Play.tsx
  - src/ui/Toolbar.tsx

テスト結果：181 件中 179 PASS, 2 FAIL
  ❌ e2e/sudoku.spec.ts:12 (screenshot 差異 tolerance 超過)
  ❌ e2e/security.spec.ts:8 (CSP)

カバレッジ：line 92.3%, branch 87.1%

レポート：runs/2026-08-19_1430/report.xlsx
スクリーンショット：runs/2026-08-19_1430/screenshots/

承認しますか？ [y/n]:
```

**動作**：
- **y**：Phase 8 へ
- **n**：全 .bak を復元 (`mv *.bak → *`)、`current/dump.json` 破棄、`status.txt = REJECTED`、runs フォルダは監査用に保留

---

### Phase 8 — Snapshot 昇格 + commit + PR

**手順**：
1. `.bak` を全部削除
2. `snapshots/current/dump.json` → `snapshots/previous/dump.json` に上書き移動
3. `status.txt = APPROVED` を書く
4. 日本語 commit：
   ```
   機能更新: Figma 同期による UI 反映

   - src/screens/Home.tsx: ヘッダ色 #F5F5F5 → #EEEEEE
   - src/screens/Play.tsx: リセットボタン形状変更
   - src/ui/Toolbar.tsx: 数字パッド間隔調整

   Figma nodeIds: 11-1896, 18-6, 12-3615
   Report: _archive/figma-sync-mcp/runs/2026-08-19_1430/report.xlsx

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   ```
5. PR 作成（body に diff 摘要 + report.xlsx path + 未登記 nodeId 警告一覧を載せる）

---

## 5. Failure & Rollback Matrix

| 段階 | 失敗内容 | 挙動 |
|---|---|---|
| Phase 1 | MCP 呼び出しタイムアウト | 3 回リトライ、それでも失敗なら abort（何も変えず終了） |
| Phase 1 | Figma セッション未起動 | エラーメッセージで人発話に戻す |
| Phase 2 | previous 不在（初回起動） | baseline として current 昇格、Phase 3 以降 skip |
| Phase 2 | diff 空 | 早退、`status.txt = NO_CHANGE` |
| Phase 3 | 変化 nodeId が config に未登記 | 警告のみ、他 file は続行、警告一覧を PR body に載せる |
| Phase 3 | `get_design_context` 失敗 | 該当 file は skip して他続行、失敗一覧を PR body に載せる |
| Phase 4 | dev server 起動失敗 | screenshot skip、Excel 該当セルに「N/A」記入、Phase 5 続行 |
| Phase 5 | テスト FAIL | Phase 6 続行、Excel に赤字で記録、Phase 7 で人判断 |
| Phase 7 | n（拒否） | 全 .bak 復元、current 破棄、`status.txt = REJECTED` |
| Phase 8 | commit 失敗（pre-commit hook 等） | 修正して新 commit（amend 禁止）、rollback せず |
| Phase 8 | PR 作成失敗 | commit は残す、PR は人手で作成 |

---

## 6. config.json スキーマ

```json
{
  "figmaFileKey": "cwmewA4MTWktw6E7uhQFK2",
  "pages": {
    "JP": "0:1",
    "ZH": "6:6",
    "EN": "6:410"
  },
  "frames": [
    { "nodeId": "11-1896", "file": "react_sudoku_app/src/screens/Home.tsx",   "component": "Home" },
    { "nodeId": "18-6",    "file": "react_sudoku_app/src/screens/Play.tsx",   "component": "Play" },
    { "nodeId": "12-3615", "file": "react_sudoku_app/src/ui/ResetDialog.tsx", "component": "ResetDialog" }
  ],
  "diffProps": ["name", "fills", "strokes", "effects", "opacity", "characters", "style", "boundVariables"],
  "reactAppRoot": "react_sudoku_app",
  "devServer": { "cmd": "npm run dev", "url": "http://localhost:5173" },
  "playwright": { "viewport": { "width": 1440, "height": 900 } },
  "androidPolicy": "mark_skipped",
  "pixelmatchThreshold": 0.1
}
```

---

## 7. 呼び出し回数コスト

| 場面 | Claude MCP 呼び出し |
|---|---|
| 変化なし | 1 (Phase 1 のみ) |
| 1 要素の色変化 | 1 (Phase 1) + 1 (Phase 3) = 2 |
| 3 ファイル同時変化 | 1 + 3 = 4 |
| 全ページ大改修 | 1 + N (変化ファイル数) |

Figma MCP 200 回/日枠 → 日常運用（1-3 回同期/日）で余裕。

---

## 8. 開発 TODO

| # | 作業 | 想定所要 |
|---|---|---|
| 1 | ディレクトリ scaffold | ✅ 完了 |
| 2 | `config.json` 作成 | 15 分 |
| 3 | `scripts/lib/walk.js` の JS 骨格 + `use_figma` 実測 | 60 分 |
| 4 | `01-dump.js` + `02-diff.js` + テスト fixture | 90 分 |
| 5 | `03-apply.js`（`get_design_context` 呼び + JSX 差替え） | 60 分 |
| 6 | `04-screenshot.js`（Playwright + pixelmatch） | 90 分 |
| 7 | `05-test.js`（全套テスト + coverage 集計） | 60 分 |
| 8 | `06-report.js`（openpyxl + 12_カバレッジ sheet 追加） | 120 分 |
| 9 | `07-confirm.js`（rollback + commit + PR） | 60 分 |
| 10 | `SKILL.md` 記述 | 45 分 |
| 11 | E2E 通電テスト（1 色変更で全 Phase） | 90 分 |
| 12 | 開発完了後、不要ファイル大清理 | 60 分 |

合計 ~13 時間

---

## 9. 未解決事項（実装前に決める）

- [ ] `config.json.frames` の初期値（3 ページ分の nodeId → React file 対応表）
- [ ] Android 実機 sheet の埋め方（`androidPolicy` の default 値）
- [ ] `runs/` の retention policy（全部残す / N 日で自動削除）
- [ ] 未登記 nodeId 警告の PR body への載せ方（全件 / 抜粋）
- [ ] pixelmatch tolerance 閾値の default 値

---

## 付録 A. 将来対応：デザイナー指示テキストの取り込み（v2 予定）

**目的**：視覚差分だけでは表現できない意図（「このボタンを削除して」「ブランドカラーに変更」「別画面へのリンクに」等）を、デザイナーが Figma に書いたテキストとして取得し、コード修正に反映する。

**方式候補**（v2 設計時に選択）：
| 方式 | 取得手段 | MCP 単独可 | 備考 |
|---|---|---|---|
| Figma コメント | REST `/v1/files/:key/comments` | ❌ PAT 必要 | デザイナー的に最も自然 |
| Dev Mode Annotations | `use_figma` で `node.annotations` | ✅ | 公式開発者向け機能 |
| レイヤー名記法 `[指示]` | `use_figma` で `node.name` | ✅ | 追加コスト 0 |
| Component Description | `use_figma` で `node.description` | ✅ | Component のみ |

**v1 との統合ポイント**（実装時に検討）：
- Phase 2.5 として指示取得フェーズを追加
- Phase 3 の `get_design_context` 呼び出しに指示テキストを付加
- 適用済み指示のマーク（コメント resolved 化 / annotation flag）
- 信頼できる作成者フィルタ（改ざん対策）

**v1 では対象外**：v1 は視覚差分駆動のみで完成させ、稼働後にデザイナーとの運用ルール（コメント / Annotation どちらを使うか）を決めてから v2 として追加する。
