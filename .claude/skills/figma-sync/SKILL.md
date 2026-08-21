---
name: figma-sync
description: Use when user says "/figma-sync" or wants to reflect Figma design changes to React code. Runs the full v4 sync pipeline (C 重案：diff_versions 主 + 空時は全量取得 fallback) covering version check → diff → apply → test → report → approval → commit → state update.
---

# figma-sync v4 実行手順

**SPEC**: `docs/superpowers/specs/2026-08-21-figma-sync-v4-spec.md`
**Plan**: `docs/superpowers/plans/2026-08-21-figma-sync-v4-implementation.md`
**Flowview**: `docs/superpowers/specs/2026-08-20-figma-console-sync-flowview.md`

## 起動フロー（runner ベース）

Claude Code は `scripts/run.mjs` runner を段階的に呼び出す。runner は「持ってるデータで進めるだけ進め、追加が必要なら exit 2 で何が要るか伝える」設計。

### ステップ 1: figma_get_file_versions 実行

```
mcp__figma-console-mcp__figma_get_file_versions(
  fileUrl=<config.figmaFileUrl>, max_versions=1, include_autosaves=true
)
```

レスポンスを一時ファイルに保存（例：`/tmp/fs/head.json`）。

### ステップ 2: runner 起動

```
cd react_sudoku_app/scripts/figma-sync
node scripts/run.mjs --head-file /tmp/fs/head.json
```

runner exit code:
- **0 = 成功終了**
  - `NO_CHANGE`: head 未変化、call 1 で早期終了
  - `INITIAL_BASELINE`: 初回起動、fallback で baseline seed 完了
  - `NO_CHANGE_VIA_FALLBACK`: fallback local diff で真に変化なし
- **2 = 追加 MCP データ要求**
  - stderr の「追加 MCP データが必要」メッセージを読み、指定された MCP を呼んで file 保存、再度 runner に `--diff-file` or `--tree-file` を追加して起動

### ステップ 3: 追加データ fetch → runner 再起動（必要時）

例：runner が「figma_diff_versions が必要」と言えば：

```
mcp__figma-console-mcp__figma_diff_versions(
  fileUrl=..., from_version=<state.last_version_id>, to_version=<head_version_id>,
  component_ids=<config.frames の nodeId 一覧>, mode='detailed'
)
```

保存 → 再起動：

```
node scripts/run.mjs --head-file /tmp/fs/head.json --diff-file /tmp/fs/diff.json
```

diff 空 → runner が「fallback 用の全 tree 取得が必要」と言えば：

```
mcp__figma-console-mcp__figma_get_file_at_version(
  fileUrl=..., version_id=<head_version_id>, depth=3,
  node_ids=<config.frames の nodeId 一覧>
)
```

保存 → 再起動 with `--tree-file`。

### ステップ 4: Phase 3-9（未実装）

runner が `CHANGED_READY_FOR_APPLY` or `CHANGED_VIA_FALLBACK_READY_FOR_APPLY` で終了したら、`runs/<ts>/status.txt` と `diff.json` を確認。

**Phase 3-9（JSX 生成 / screenshot / test / Excel / y/n / commit / state 更新）は現時点未実装**、Task 16 Step 5（拒否テスト）の前提。既存の script 05-apply / 06-screenshot / 07-test / 08-report / 09-confirm はあるが、runner から呼ばれていない。次段階で runner に統合する。

Phase 3 (05-apply.mjs) は `get_design_context` で JSX 生成、React file を直接上書き（rollback は Phase 7 の `git restore` に一任、`.bak` 廃止済 → memory [[feedback-no-defensive-double]] 参照）。

## Runner が自動化する事

- `.figma-sync-state.json` の読み書き
- `snapshots/last-full.json` の読み書き（fallback 発動時）
- `runs/<ts>/status.txt`（各 run の判定結果）
- `runs/<ts>/diff.json` / `detail.json` / `fallback.log`（該当 Phase 実行時）
- Phase 順の分岐判定（NO_STATE → fallback、CHANGED → diff、diff 空 → fallback、等）

## 必要な MCP

- `figma-console-mcp` (v1.40+)：`figma_get_file_versions` / `figma_diff_versions` / `figma_get_file_at_version`
- 将来（Phase 3）：`plugin:figma:figma` の `get_design_context`

## 前提

- `.claude.json` の `figma-console-mcp` env block に `FIGMA_PERSONAL_ACCESS_TOKEN` 設定済
- `react_sudoku_app/scripts/figma-sync/config.json` の `figmaFileUrl` が対象ファイル URL
- Figma Desktop 起動 **不要**（REST 経由）

## Task 16 E2E で判明した事（flowview 参照）

- `local-diff.mjs` の snapshot 形式は `{ document: {...} }` と `{ nodes: {} }` 両対応（修正済 commit `05a0f53`）
- Scoped diff は「scoped node 自身の binding のみ」検出。descendant の binding 変更は **fallback 経由**で吸収する暫定 B 方針
- `figma_get_file_versions` は cache 遅延あり。`figma_diff_versions(to='current')` の `resolved_version_id` の方が新鮮
