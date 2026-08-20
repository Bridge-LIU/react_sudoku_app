import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 4: before/after screenshot 生成（簡易版）
 * dev server は事前起動されている前提。before は前回 run の after 画像を流用（簡易実装）。
 * 精度アップは実装本体（後続 iteration）で対応。
 */
export async function takeScreenshots({ config, changedFiles, runDir }) {
  const outDir = join(runDir, 'screenshots');
  mkdirSync(outDir, { recursive: true });

  const results = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize(config.playwright.viewport);

  try {
    for (const file of changedFiles) {
      const comp = file.replace(/[^\w]/g, '_');

      await page.goto(config.devServer.url);
      await page.waitForLoadState('networkidle');
      const afterBuf = await page.screenshot({ fullPage: true });
      const afterPath = join(outDir, `${comp}_after.png`);
      writeFileSync(afterPath, afterBuf);

      const beforePath = join(outDir, `${comp}_before.png`);
      const diffPath = join(outDir, `${comp}_diff.png`);

      results.push({
        file,
        before: existsSync(beforePath) ? beforePath : null,
        after: afterPath,
        diff: null
      });
    }
  } finally {
    await browser.close();
  }

  return { screenshots: results, outDir };
}
