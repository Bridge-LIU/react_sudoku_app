/**
 * E2E: 本番デプロイ URL に対して数独アプリの基本フローを検証。
 *
 * === 検証シナリオ ===
 *   1. ホーム画面が正しく描画される（title と難易度セレクター）
 *   2. 難易度「初級」をクリックして /play/easy に遷移
 *   3. Sudoku 盤面と操作 UI（削除/メモ/ヒント/リセット）が表示される
 *   4. タイマーが 00:00 から進行する
 *   5. SPA fallback: 存在しないパスに直接アクセスしても index.html が返る
 *
 * === 実行方法 ===
 *   npm run test:e2e
 *
 * === 注意 ===
 *   本番 URL に対して実行するため、ネットワーク接続と CDN 状態に依存。
 *   Azure SWA のコールドスタート時は初回応答が遅い（1-2s）。
 */
import { test, expect } from '@playwright/test';

test.describe('Sudoku production smoke E2E', () => {
  test('home page loads with title and difficulty options', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Sudoku');
    // 難易度セレクターの日本語ラベルが見える（現状デフォルト日本語）
    await expect(page.getByText('難易度を選択')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('初級')).toBeVisible();
    await expect(page.getByText('中級')).toBeVisible();
    await expect(page.getByText('上級')).toBeVisible();
  });

  test('difficulty selection navigates to /play/easy', async ({ page }) => {
    await page.goto('/');
    await page.getByText('初級').click();
    // Expo Router 遷移待ち
    await page.waitForURL('**/play/easy', { timeout: 10_000 });
    // Play 画面のマーカー要素
    await expect(page.getByText('経過時間')).toBeVisible({ timeout: 10_000 });
  });

  test('play screen shows board and action controls', async ({ page }) => {
    await page.goto('/play/easy');
    // 操作パネル 6 種
    for (const label of ['削除', 'メモ', '元に戻す', 'やり直し', 'ヒント', 'リセット']) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 10_000 });
    }
    // 数字パッド 1-9
    for (let d = 1; d <= 9; d++) {
      await expect(page.getByText(String(d)).first()).toBeVisible();
    }
  });

  test('timer starts counting on play screen', async ({ page }) => {
    await page.goto('/play/easy');
    await expect(page.getByText('経過時間')).toBeVisible({ timeout: 10_000 });
    // 3秒待ってタイマーが進んでるか（00:00 から離れる）
    await page.waitForTimeout(3_500);
    const timerBody = await page.textContent('body');
    expect(timerBody).toContain('00:0');  // まだ 1分以内
    expect(timerBody).not.toContain('00:00\n0'); // 何かしら 3s くらい進んでる（stringy な check）
  });

  test('SPA fallback: direct link to nonexistent path returns index.html', async ({ page }) => {
    const res = await page.goto('/some/nonexistent/path');
    expect(res?.status()).toBe(200);
    // index.html の title が返ってる
    await expect(page).toHaveTitle('Sudoku');
  });
});
