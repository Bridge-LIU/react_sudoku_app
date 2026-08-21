---
name: figma-comments
description: Use when user says "/figma-comments" or wants to fetch and display unresolved Figma comment threads. Calls figma-console-mcp figma_get_comments, filters top-level unresolved threads, and displays them with JST time / author / node_id / pin link. Read-only MVP; execution phase (LLM で node → React 解決 → JS diff → apply) is future work.
---

# figma-comments 実行手順（MVP、読取と表示のみ）

**flowview**: `docs/superpowers/specs/2026-08-20-figma-console-sync-flowview.md` のフェーズ 0

## 起動フロー

Claude Code は以下を実行する（**自前スクリプトは書かない**、`figma-console-mcp` の tool を直接呼ぶ）。

1. `react_sudoku_app/.figma-sync.json` を Read で読み `fileKey` を取得
2. `mcp__figma-console-mcp__figma_get_comments` を以下引数で呼ぶ:
   - `fileUrl`: `https://www.figma.com/file/{fileKey}`
   - `as_md`: `true`
   - `include_resolved`: `false`（default）
3. 返ってきた `comments` 配列を以下条件でフィルタ:
   - `parent_id === ''`（トップレベル、リプライ除外）
   - `resolved_at === null`（未解決）
4. 抽出結果を以下フォーマットで表示。0 件なら「未処理コメントなし。」の 1 行だけ

```
=== Figma 未処理コメント N 件 ===

[1] YYYY-MM-DD HH:MM JST | author
    node: node_id
    msg : message
    link: https://www.figma.com/file/{fileKey}?node-id={node_id_dash}#comment={id}

[2] ...
```

**フォーマット規則**:
- **JST 変換**: `created_at`（UTC ISO）に +9h、`YYYY-MM-DD HH:MM JST` 形式
- **順序**: `order_id` 降順（新しいコメントを上）
- **`node_id` 未設定**（`client_meta === null`）: `(no pin)` と表示、link は `#comment={id}` のみ
- **link の `node_id`**: `:` を `-` に置換（`228:2` → `228-2`）

## 必要な MCP

- `figma-console-mcp` （v1.40+）
  - 使う tool: `figma_get_comments`

## 前提

- `.claude.json` の `figma-console-mcp` env block に `FIGMA_PERSONAL_ACCESS_TOKEN` 設定済
- `react_sudoku_app/.figma-sync.json` に `fileKey` 記載済

## 設計判断（2026-08-21 user 確認）

- **`@claude` 等の前缀不要**: デザイナーの学習コストゼロ。「未 resolve な top-level コメント全部を候補として並べる」＝ Figma 原生の resolve 機能を「処理済フラグ」として流用
- **リプライは除外**（`parent_id !== ''`）: 指示単位は thread top-level のみ、リプライは文脈情報とみなす
- **状態ファイル不要**: Figma 側 resolve が事実上の "処理済" 印。ローカル state ファイルとの二重管理を回避
- **方向性は片方向**: Figma コメント → JS 修正のみ、逆方向はやらない
- **自前スクリプトを書かない**: 直接 REST を叩かず、`figma-console-mcp` の tool を使う（[[feedback-no-self-made-mcp]] 遵守）

## 次段階（未実装）

- LLM で `node_id` → React コンポーネント解決
- JS diff 生成 → `/figma-sync` のフェーズ 3（JSX 生成）以降に合流
- commit 後、`figma_post_comment` で完了リプライ + 該当 thread を解決済にする
