/**
 * セキュリティテスト（E2E 経由）
 *
 * 本番 URL に対して以下を自動検証：
 *   1. Security headers 5 種すべてが設定されている
 *   2. CSP が適切に設定されている（default-src 'self'）
 *   3. HTTPS 強制（Strict-Transport-Security）
 *   4. Clickjacking 防止（X-Frame-Options: DENY）
 *   5. MIME sniffing 防止（X-Content-Type-Options: nosniff）
 *
 * === curl 手動確認との違い ===
 *   curl は「ヘッダーが返る」しか見ないが、Playwright は「実ブラウザが受理する」まで見る。
 *   例：CSP 違反があるとページ動作が壊れる → E2E テストで検出される。
 */
import { test, expect } from '@playwright/test';

test.describe('Security headers @ production', () => {
  test('Strict-Transport-Security enforces HTTPS', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const hsts = res.headers()['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=');
    expect(hsts).toContain('includeSubDomains');
    expect(hsts).toContain('preload');
  });

  test('X-Frame-Options prevents clickjacking', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  test('X-Content-Type-Options prevents MIME sniffing', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('Referrer-Policy limits referrer leakage', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('X-XSS-Protection is present', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-xss-protection']).toBe('1; mode=block');
  });

  // ================================================================
  // 【P-04 修正済】staticwebapp.config.json の各 route headers に
  // security ヘッダーを明示追加（globalHeaders が route override で消える
  // Azure SWA 仕様の回避）。デプロイ後に本テストが緑になる。
  // ================================================================
  test('[P-04] Permissions-Policy restricts sensitive APIs', async ({ request }) => {
    const res = await request.get('/');
    const pp = res.headers()['permissions-policy'];
    expect(pp).toBeDefined();
    expect(pp).toContain('camera=()');
    expect(pp).toContain('microphone=()');
    expect(pp).toContain('geolocation=()');
  });

  test('[P-04] Content-Security-Policy restricts script sources', async ({ request }) => {
    const res = await request.get('/');
    const csp = res.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

test.describe('Runtime security (in-browser)', () => {
  test('page loads without CSP violations', async ({ page }) => {
    // CSP violation は console error として出る
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('content security policy')) {
        cspErrors.push(msg.text());
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    expect(cspErrors).toEqual([]);
  });

  test('production page has no exposed source maps in prod HTML', async ({ page }) => {
    const res = await page.goto('/');
    const html = (await res?.text()) ?? '';
    // sourceMappingURL コメントが index.html にリーク していないこと（バンドル JS の方は別）
    expect(html).not.toMatch(/sourceMappingURL/i);
  });
});
