---
name: figma-sync
description: Use when user says "/figma-sync" or wants to reflect Figma design changes to React code. Runs the full v4 sync pipeline (C 重案：diff_versions 主 + 空時は全量取得 fallback) covering version check → diff → apply → test → report → approval → commit → state update.
---

# figma-sync v4 実行手順

**SPEC**: `docs/superpowers/specs/2026-08-21-figma-sync-v4-spec.md`
**Plan**: `docs/superpowers/plans/2026-08-21-figma-sync-v4-implementation.md`

## 起動フロー

Claude Code は以下の順で MCP tool を呼び出し、各 Phase の script を実行する。

1. **Phase 1-a (01-detect.mjs)**: `figma_get_file_versions` で head 取得、state と比較。一致なら NO_CHANGE で終了
2. **Phase 1-b (02-diff.mjs)**: `figma_diff_versions` で config.frames 単位の NodeDiff 抽出
3. **NodeDiff 判定**:
   - 非空 → Phase 1-c
   - 空 → Phase 1-b-fallback (03-fallback.mjs) で `figma_get_file_at_version(depth=3)` + 本地 diff、それでも空なら NO_CHANGE
4. **Phase 1-c (04-detail.mjs)**: 変わった node の詳細を `figma_get_file_at_version(node_ids=[...])` で取得
5. **Phase 3 (05-apply.mjs)**: `get_design_context` で JSX 生成、`.bak` 経由で React file 上書き
6. **Phase 4 (06-screenshot.mjs)**: dev server 起動、Playwright + pixelmatch で before/after 撮影
7. **Phase 5 (07-test.mjs)**: `npm test`、`npm run test:e2e`、`npm audit` 実行
8. **Phase 6 (08-report.mjs)**: Python + openpyxl で Excel 報告書生成
9. **Phase 7-9 (09-confirm.mjs)**: 人 y/n 確認 → rollback or commit + PR → state/snapshot 更新

## 必要な MCP

- `figma-console-mcp` (v1.40+)
- `plugin:figma:figma` (公式)

## 前提

- `.claude.json` の `figma-console-mcp` env block に `FIGMA_PERSONAL_ACCESS_TOKEN` 設定済
- `react_sudoku_app/scripts/figma-sync/config.json` の `figmaFileUrl` が対象ファイル URL
- Figma Desktop 起動 **不要**（REST 経由）
