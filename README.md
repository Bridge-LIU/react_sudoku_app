# React版 数独アプリ

Expo (React Native + React Native Web) で **iOS / Android / Web** 三端を同一コードで提供する数独アプリ。BAF (Bridge AI Framework) に準拠した AI 協働開発の学習プロジェクト。

**ライブデモ**: (Azure SWA デプロイ後に URL 追記)

---

## 技術スタック

| レイヤ | 採用技術 |
|---|---|
| フレームワーク | Expo SDK 54 (React Native 0.81 / React 19.1) |
| ルーティング | Expo Router 6 (file-based) |
| 言語 | TypeScript 5.9 (`strict` + `noUncheckedIndexedAccess`) |
| 状態管理 | `useReducer` + `Context` (2つの Context 分離で不要 re-render 削減) |
| 永続化 | `@react-native-async-storage/async-storage` (Web は IndexedDB) |
| 国際化 | `i18next` / `react-i18next` (ja / zh / en) |
| バリデーション | zod v4 (API 契約 + snapshot 復元) |
| テスト | Vitest 93 tests (engine / reducer / mocks / contracts) |
| デプロイ (Web) | Azure Static Web Apps + GitHub Actions |
| デザイン | Bento Grid Modern (chunky borders + offset shadows) |

---

## セットアップ

前提: Node.js 20+, npm 10+

```powershell
git clone https://github.com/Bridge-LIU/react_sudoku_app.git
cd react_sudoku_app
npm install --legacy-peer-deps
```

---

## 開発コマンド

| コマンド | 用途 |
|---|---|
| `npm run web` | Web 開発サーバー (http://localhost:8081) |
| `npx expo start` | Metro (Web + Native、Expo Go 用 QR 出る) |
| `npx expo start --tunnel` | LAN 経由不能な時、ngrok tunnel 経由 |
| `npm run typecheck` | TypeScript 型検査 |
| `npm run test:engine` | Vitest 全テスト (93) |
| `npm run export:web` | Web 用静的ビルド (`dist/` へ) |

## Expo Go で実機確認

1. スマホ (iOS/Android) に **Expo Go** をインストール (App Store / Play Store)
2. PC とスマホを同じ Wi-Fi に接続
3. `npx expo start` → 出た URL (例 `exp://172.31.x.x:8081`) を Expo Go の「Enter URL manually」に入力

---

## デプロイ (Azure Static Web Apps)

`.github/workflows/azure-swa.yml` で自動デプロイ設定済み。

### 初回セットアップ

1. **Azure Portal** → Static Web Apps → 作成 (Free plan / East Asia)
2. Deployment source は **Other** を選択 (workflow は自作なので Azure に生成させない)
3. 作成後、**Manage deployment token** から token をコピー
4. GitHub リポジトリの **Settings** → **Secrets** → **Actions** に:
   - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: (コピーした token)
5. `main` へ push すると自動でビルド + デプロイ

### 手動ビルド + ローカル確認

```powershell
npm run export:web
# dist/ に静的ファイル生成
```

### SPA ルーティング + セキュリティヘッダ

`staticwebapp.config.json` で:
- 全 404 を `/index.html` にフォールバック (`/play/easy` を直接開いても OK)
- CSP / X-Frame-Options / Permissions-Policy 等セキュリティヘッダ
- `/_expo/static/*` に長期 immutable キャッシュ

---

## AI 利用方針 (仕様書 §4.2 / §8.2 準拠)

**現時点**: AI ヒントは Mock 実装 (`src/mocks/handlers/hints.ts` が数独 solver で正解計算)。実 AI 統合は未実装。

**BAF 信用境界の設計** (実 AI 統合時にそのまま活きる):

- API 契約は zod schema (`src/mocks/schemas/hint.ts`) で固定 → Mock ↔ 実 AI で交換可能
- AI 返答は必ず `engine/hintVerifier.ts` で二重検証:
  - `INITIAL_CELL` / `ALREADY_FILLED` / `NOT_IN_SOLUTION` / `CONFLICT` を検出
  - 全 reject reason は `engine/hintVerifier.test.ts` + `mocks/__tests__/hints.test.ts` で網羅
- API key は client 埋め込み禁止 → Azure Functions 側で管理する前提

**AI 差替え可能な選択肢** (実装未):
- Anthropic Claude / Google Gemini / Groq / Deepseek / Ollama
- どれを選んでも frontend / zod schema は変更不要 (Azure Functions body のみ)

---

## ディレクトリ構成

```
src/
├── app/                    # Expo Router (画面)
│   ├── _layout.tsx         # 全体 layout + ErrorBoundary + Provider
│   ├── index.tsx           # Home (難度選択 + 言語切替)
│   └── play/[difficulty].tsx  # Play 画面 (動的ルート)
├── engine/                 # 数独ロジック (純関数、副作用無し)
│   ├── board.ts            # 座標 / peer / 冲突検出
│   ├── solver.ts           # backtracking + MRV
│   ├── generator.ts        # 難度別 puzzle 生成
│   ├── hintVerifier.ts     # AI hint 二重検証
│   └── uniqueness.ts       # 唯一解判定
├── state/                  # gameReducer + Context
│   ├── gameReducer.ts      # 全 action / state
│   ├── gameContext.tsx     # Provider + タイマー effect
│   └── selectors.ts        # highlights 計算
├── ui/                     # 表示コンポーネント (Bento デザイン)
│   ├── Board.tsx / Cell.tsx
│   ├── NumberPad.tsx / Toolbar.tsx
│   ├── StatsBar.tsx        # Difficulty / Timer / Mistakes / Hints pill
│   ├── LanguageSwitch.tsx  # Home 右上の言語切替
│   ├── CompleteDialog.tsx / DifficultyPicker.tsx / SettingsSheet.tsx
│   ├── ErrorBoundary.tsx
│   └── theme.ts            # colors / spacing / typography / bento tokens
├── api/                    # クライアント側 API wrapper (Mock/Real 透過)
│   ├── httpClient.ts       # fetch + zod + timeout + AbortController
│   ├── errors.ts           # ApiError / Network / Timeout / Http / Schema
│   └── {puzzles,hints,savedGames,analytics}.ts
├── mocks/                  # in-process mock (USE_MOCKS=true 時)
│   ├── index.ts            # dispatcher + installMocks
│   ├── schemas/*.ts        # zod contracts (5 endpoints)
│   ├── handlers/*.ts       # mock implementations
│   ├── fixtures/index.ts   # ランタイム fixture generator
│   └── __tests__/*.test.ts # 契約テスト (17)
├── storage/asyncStorage.ts # snapshot 保存 (validation 付き)
├── i18n/                   # ja / zh / en 辞書 + i18next 初期化
└── types/domain.ts         # 単一 source of truth (Digit / Board / Difficulty)
```

---

## テスト状況

**93 tests passing** (`npm run test:engine`):

| カテゴリ | ファイル | 件数 |
|---|---|---|
| Engine | `src/engine/*.test.ts` | 74 (board, solver, uniqueness, generator, difficulty, hintVerifier, validate) |
| Reducer | `src/state/*.test.ts` | 17 (全 action + edge case) |
| Mock 契約 | `src/mocks/__tests__/*.test.ts` | 17 (puzzles, hints incl. injection, savedGames, analytics) |

UI コンポーネントの smoke test は最小限に留めている (実質は Expo Go で目視確認)。

---

## BAF (Bridge AI Framework) 準拠状況

| 原則 | 実装状況 |
|---|---|
| AI 返答は engine で二重検証 | ✅ `hintVerifier` + PlayScreen onHint |
| API key はクライアントに埋め込まない | ✅ (実 AI 未接続、Mock のみ) |
| 各 Task 後に BAF 2段階レビュー (spec+security + code quality) | ✅ Task 5 / 6 / 7 で実施 |
| 個人情報を AI に送らない | ✅ 送信内容は puzzleId + 盤面のみ |
| AI タイムアウト / 拒否 / 形式不正への対応 | ✅ `SchemaError` / `TimeoutError` / `HttpError` / `NetworkError` を分別 |
| ユーザーへは i18n 化された友好的エラーメッセージ | ✅ `hint.noHintAvailable` 等 |

---

## 課題情報

内部設計書・BAF 方針・実施計画書は非公開資産として別管理（本リポジトリには含まれません）。

Bridge Inc. AI 開発課題「React 版 数独アプリ」。学習・検証目的のプロジェクト。

## 既知の制約 / 未実装

- Task 8-4: UI コンポーネントの smoke test は最小限
- Task 8-5: 実 Azure SWA へのデプロイは未実施 (config は完了)
- Azure Functions 実装は範囲外 (Mock のみ)
- Azure OpenAI 連携は範囲外 (Mock ソルバーで代替)
- iOS Native ビルド (EAS Build 経由の IPA 生成) は範囲外
