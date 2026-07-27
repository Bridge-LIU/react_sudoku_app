# React版 数独アプリ

Expo (React Native + React Native Web) で iOS / Android / Web 三端を同一コードで提供する数独アプリ。バックエンドは Azure Static Web Apps + Managed Functions + Cosmos DB を想定。

---

## 技術スタック

| レイヤ | 採用技術 |
|---|---|
| フレームワーク | Expo SDK 54 (React Native 0.81 / React 19) |
| ルーティング | Expo Router (file-based) |
| 言語 | TypeScript (strict) |
| 状態管理 | `useReducer` + `Context` |
| 永続化 | `@react-native-async-storage/async-storage` |
| 国際化 | `i18next` / `react-i18next` (ja / zh / en) |
| バリデーション | zod |
| テスト | Vitest (unit) + Jest / React Native Testing Library |
| デプロイ (Web) | Azure Static Web Apps (Free tier) |
| バックエンド | Azure Functions (Managed) + Cosmos DB |
| 監視 | Azure Application Insights + Log Analytics |

---

## セットアップ手順

前提: Node.js 20+, npm 10+

```bash
git clone https://github.com/Bridge-LIU/react_sudoku_app.git
cd react_sudoku_app
npm install
```

---

## 開発コマンド

| コマンド | 用途 |
|---|---|
| `npm run web` | Web 開発サーバー (http://localhost:8081) |
| `npm run ios` | iOS シミュレータ |
| `npm run android` | Android エミュレータ |
| `npm test` | Jest 単体テスト |
| `npx vitest` | Vitest 単体テスト (engine / reducer / mocks) |
| `npx tsc --noEmit` | 型検査 |
| `npx expo export --platform web` | Web 用静的ビルド (`dist/` へ出力) |

---

## デプロイ手順 (Azure Static Web Apps)

### 前提

- Azure サブスクリプション (Free tier で可)
- GitHub リポジトリ (Bridge-LIU/react_sudoku_app)

### 手順

1. **Azure Portal** → **Static Web Apps** → **作成**
2. 以下を指定:
   - Plan: **Free**
   - Region: **East Asia**
   - Deployment source: **GitHub**
   - Repository: `Bridge-LIU/react_sudoku_app` / Branch: `main`
   - Build preset: **Custom**
     - App location: `/`
     - Api location: `api` (Managed Functions を有効化する場合)
     - Output location: `dist`
3. 作成後、Azure が `.github/workflows/azure-static-web-apps-*.yml` を自動生成する
4. Workflow に Expo のビルドコマンドを追加 (デフォルトは Expo 非対応):
   ```yaml
   - name: Build Expo Web
     run: |
       npm ci
       npx expo export --platform web
   ```
5. `main` へ push すると自動デプロイ

### SPA ルーティング

`public/staticwebapp.config.json` で `/index.html` へのフォールバックを設定済み。`/play/easy` などのパスを直接開いても 404 にならない。

---

## 環境変数 (Feature Flags)

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `EXPO_PUBLIC_USE_AZURE_API` | `false` | true で Azure Functions を呼ぶ / false で Mock を使う |
| `EXPO_PUBLIC_USE_AZURE_AI` | `false` | true で Azure OpenAI ヒントを呼ぶ / false で Mock ヒントを返す |

ローカル開発は `.env` に上書き。Static Web Apps では **Configuration** → **Application settings** に登録。

---

## AI 利用方針

- ヒント文言の生成のみを Azure OpenAI に委譲
- **AI 回答は必ず数独エンジン (`src/engine/hintVerifier.ts`) で検証**
- 検証に失敗したヒントは破棄し、フォールバック文言を表示
- API キーはクライアントに埋め込まず、Azure Functions を経由

---

## ディレクトリ構成 (抜粋)

```
src/
├── app/              # Expo Router (画面)
├── engine/           # 数独ロジック (生成 / 検証 / ヒント検証)
├── state/            # gameReducer + Context
├── ui/               # 表示コンポーネント (Board, Cell, NumberPad ...)
├── mocks/            # API モック (services + handlers + schemas)
└── i18n/             # 多言語辞書 (ja / zh / en)
api/                  # Azure Functions (SWA Managed) — 予定
public/               # 静的ファイル (SWA config など)
```

---

## 課題情報

Bridge Inc. AI 開発課題「React 版 数独アプリ」。学習・検証目的のプロジェクト。
