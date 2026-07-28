/**
 * Playwright 設定：本番 URL (Azure SWA) に対して E2E を実行。
 * ローカル dev サーバを起動する場合は webServer を有効化する。
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'https://lemon-cliff-0313ffa10.7.azurestaticapps.net',
    trace: 'on-first-retry',
    // 明示的に日本語ロケール（expo-localization が deviceLanguage='ja' を返す）
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    // headless: true がデフォルト
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // ローカル開発用 (必要になったらコメント解除)
  // webServer: {
  //   command: 'npm run web',
  //   port: 8081,
  //   reuseExistingServer: !process.env.CI,
  // },
});
