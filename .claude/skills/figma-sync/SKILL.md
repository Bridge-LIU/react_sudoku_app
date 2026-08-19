---
name: figma-sync
description: 数独プロジェクトの Figma → React 同期パイプライン。デザイナーが Figma を更新した後、Liu の発話で 8 フェーズを順番に実行してコードに反映、テスト、Excel 報告書生成まで自動化する。トリガー：「/figma-sync」「数独 デザイン 更新」「figma 反映」「figma 同期」
---

# Figma Sync (MCP-only)

デザイナーが Figma を更新した後、Liu の発話で以下 8 フェーズを順番に実行する。

**前提**: Figma デスクトップまたはブラウザで対象ファイル（cwmewA4MTWktw6E7uhQFK2）が開かれていること。

## Phase 1: MCP dump

1. `react_sudoku_app/scripts/figma-sync/config.json` を読む
2. `react_sudoku_app/scripts/figma-sync/scripts/lib/walk.js` の `buildWalkPayload({ pageIds, diffProps })` を呼ぶ
3. 戻り値の JS 文字列を `mcp__plugin_figma_figma__use_figma` に渡す（fileKey は config の figmaFileKey）
4. MCP 応答（JSON 文字列）を stdin 経由で `node scripts/01-dump.js` に流す

例：
```powershell
cd react_sudoku_app/scripts/figma-sync
$mcp_result | node scripts/01-dump.js
```

## Phase 2: Local diff

1. run dir を作成：
```powershell
$RUN_DIR = node -e "import('./scripts/lib/run-context.js').then(m => console.log(m.createRunDir('.')))"
```
2. `node scripts/02-diff.js $RUN_DIR` 実行
3. exit code 2（NO_CHANGE）なら早退

## Phase 3: 対応付け + code apply

1. `node scripts/03-apply.js $RUN_DIR prepare` — .bak backup + changed-files.json 作成
2. `$RUN_DIR/changed-files.json` を読み、各 file について：
   - 対応する nodeId 群を `mcp__plugin_figma_figma__get_design_context` に渡して JSX + Tailwind を取得
   - 既存 file の該当 JSX を新内容で置換
   - **JS 論理には触らない**（strict source of truth）
3. `node scripts/03-apply.js $RUN_DIR validate` — 実際に変更が入ったか検証

## Phase 4: before/after screenshot

前提：React dev server が別ターミナルで起動していること（`cd react_sudoku_app; npm run dev`）。
また、`/__figma-sync-preview__/:component` route が react app に存在すること（Task 12 で追加予定）。

```powershell
node scripts/04-screenshot.js $RUN_DIR
```

## Phase 5: 全種テスト

```powershell
node scripts/05-test.js $RUN_DIR
```
Vitest / Jest / Playwright / npm audit を順番に実行、結果を `$RUN_DIR/test-results.json` に集計。

## Phase 6: Excel 生成

```powershell
python scripts/06-report.py $RUN_DIR
```
`$RUN_DIR/report.xlsx` に v10 テンプレ踏襲 + 12_カバレッジ シート追加。

## Phase 7: 人確認

```powershell
node scripts/07-confirm.js $RUN_DIR
```
Liu が y/n で判断。y なら Phase 8 に進み、n なら `.bak` 復元 + `snapshots/current` 破棄。

## Phase 8: commit + PR

07-confirm.js が y の場合、自動で commit まで実行（push は無効化、Liu が手動 push）。
PR 作成は `gh pr create` で追加：

```powershell
gh pr create --title "機能更新: Figma 同期による UI 反映" --body "詳細は commit と report.xlsx 参照"
```

---

## エラー時の挙動

- **Phase 1 失敗**: 何も変えず終了、Figma セッション確認を Liu に依頼
- **Phase 2 差分空**: 早退、`status.txt = NO_CHANGE`
- **Phase 3 で未登記 nodeId**: 警告のみ、他は続行、警告は PR body に記録
- **Phase 5 で FAIL**: Phase 6 に進み、Phase 7 で人が判断
- **Phase 7 で n**: `.bak` を復元、`current/dump.json` 破棄、`status.txt = REJECTED`

## 参照

- `react_sudoku_app/scripts/figma-sync/SPEC.md` — 詳細仕様
- `react_sudoku_app/scripts/figma-sync/SudoKu20260819_FLOWVIEW.md` — 全体像
- `react_sudoku_app/scripts/figma-sync/PLAN.md` — 実装計画
