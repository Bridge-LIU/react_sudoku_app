---
name: figma-comments
description: Use when user says "/figma-comments" or wants to fetch and display the latest Figma comments. Calls figma-console-mcp figma_get_comments and displays the latest 10 comments (by created_at descending) with JST time / author / node_id / pin link. Fetch + display only — no filter, no apply / delete / reply / resolve.
---

# figma-comments 実行手順（fetch + display 専用、最新 10 件）

**flowview**: `docs/superpowers/specs/2026-08-20-figma-console-sync-flowview.md` のフェーズ 0

## 役割の範囲

**このスキルは fetch + display だけ。** 何も書き込まない、何も削除しない。人が読んで手動で対応する。

**やらないこと**：
- Figma 側への reply / delete / resolve（Figma API に resolve endpoint が無く、delete は破壊的、user 決定）
- comment 内容の JSX 化・React ファイルへの apply（責任範囲が曖昧）
- 「処理済」state のローカル管理
- **top-level / unresolved 等の絞り込み**（判断せず、生データを最新 10 件そのまま並べる、user 決定 2026-08-21）

## 起動フロー

Claude Code は以下を実行する（**自前スクリプトは書かない**、`figma-console-mcp` の tool を直接呼ぶ）。

1. `react_sudoku_app/.figma-sync.json` を Read で読み `fileKey` を取得
2. `mcp__figma-console-mcp__figma_get_comments` を以下引数で呼ぶ:
   - `fileUrl`: `https://www.figma.com/file/{fileKey}`
   - `as_md`: `true`
   - `include_resolved`: `true`（絞り込まないため resolved も含める）
3. 返ってきた `comments` 配列を **`created_at` 降順ソート**、**先頭 10 件**を抽出（それ以上の判定はしない）
4. 抽出結果を以下フォーマットで表示。0 件なら「コメントなし。」の 1 行だけ

```
=== Figma コメント（最新 10 件）===

[1] YYYY-MM-DD HH:MM JST | author
    node: node_id
    msg : message
    link: https://www.figma.com/file/{fileKey}?node-id={node_id_dash}#comment={id}

[2] ...
```

**フォーマット規則**:
- **JST 変換**: `created_at`（UTC ISO）に +9h、`YYYY-MM-DD HH:MM JST` 形式
- **順序**: `created_at` 降順（新しいコメントを上）、先頭 10 件
- **`node_id` 未設定**（`client_meta === null`）: `(no pin)` と表示、link は `#comment={id}` のみ
- **link の `node_id`**: `:` を `-` に置換（`228:2` → `228-2`）
- **replies も resolved も含めて表示**（絞り込みなし）

## 必要な MCP

- `figma-console-mcp` （v1.40+）
  - 使う tool: `figma_get_comments`

## 前提

- `.claude.json` の `figma-console-mcp` env block に `FIGMA_PERSONAL_ACCESS_TOKEN` 設定済
- `react_sudoku_app/.figma-sync.json` に `fileKey` 記載済

## 設計判断（2026-08-21 user 確定）

- **絞り込みなし、最新 10 件そのまま**: judgment を skill に持たせず、人が見て判断する
- **自前スクリプトを書かない**: 直接 REST を叩かず、`figma-console-mcp` の tool を使う（[[feedback-no-self-made-mcp]] 遵守）
- **fetch-only 確定**: apply / delete / reply / resolve いずれもしない

## `/figma-sync` との関係

`/figma-comments` は完全に独立。`/figma-sync` の Phase 6 (Excel 報告書) はこの skill と同じ `figma_get_comments` を叩き、コメント一覧を「参考情報」sheet として同梱する（Phase 6 統合は次段階）。両者が同じデータ源を独立に読むだけで、状態共有は無し。
