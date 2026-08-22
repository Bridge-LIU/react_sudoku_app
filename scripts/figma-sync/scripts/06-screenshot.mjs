import { chromium as defaultChromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

/**
 * Phase 4: before/after screenshot 生成
 *
 * dev server は事前起動されている前提（config.devServer.url）。
 * changedFrameIds（config.frames の nodeId 配列）から route を解決し、該当 URL を撮影する。
 * route が null（例: modal コンポーネント）は skip。
 *
 * Vue 開発者向けメモ:
 * - Vue devtools でコンポーネントを開くのではなく、Playwright で実 URL を叩いて撮る。
 * - phase='before' は Phase 3 apply 前、phase='after' は apply 後に呼ぶ。
 * - pixelmatch diff は generateDiff() で別途生成（before/after 両方揃った時のみ）。
 *
 * @param {object} params
 * @param {object} params.config       - config.json 相当
 * @param {string[]} [params.changedFiles] - 後方互換用（未使用、changedFrameIds を優先）
 * @param {string} params.runDir       - runs/<ts>/
 * @param {'before'|'after'} params.phase
 * @param {string[]} params.changedFrameIds - config.frames の nodeId 配列
 * @param {object} [params._chromium]  - test 用 DI
 * @returns {Promise<{screenshots: Array<{component:string,file:string,before:string|null,after:string|null,diff:string|null,diffPixels:number|null,route:string|null,skipped?:string}>, outDir:string}>}
 */
export async function takeScreenshots({
  config, changedFiles, runDir, phase, changedFrameIds, _chromium
}) {
  if (phase !== 'before' && phase !== 'after') {
    throw new Error(`takeScreenshots: phase must be 'before' or 'after', got: ${phase}`);
  }
  const chromium = _chromium || defaultChromium;
  const outDir = join(runDir, 'screenshots');
  mkdirSync(outDir, { recursive: true });

  const frameById = new Map((config.frames || []).map(f => [f.nodeId, f]));
  const targets = [];
  for (const nodeId of (changedFrameIds || [])) {
    const frame = frameById.get(nodeId);
    if (!frame) continue;  // 未登記 nodeId は skip
    targets.push(frame);
  }

  const results = [];

  // 撮影対象が 0 でも browser 起動しない（time 節約）
  if (targets.length === 0) {
    return { screenshots: results, outDir };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewportSize(config.playwright?.viewport || { width: 1440, height: 900 });

    for (const frame of targets) {
      const filename = `${frame.component}_${phase}.png`;
      const outPath = join(outDir, filename);
      const otherPhase = phase === 'before' ? 'after' : 'before';
      const otherPath = join(outDir, `${frame.component}_${otherPhase}.png`);

      // route=null の modal 系は skip（before/after ともに null になる）
      if (frame.route == null) {
        results.push({
          component: frame.component,
          file: frame.file,
          before: null, after: null, diff: null, diffPixels: null,
          route: null,
          skipped: 'route is null (modal / no direct URL)'
        });
        continue;
      }

      const targetUrl = `${config.devServer.url}${frame.route}`;
      try {
        // 1. load 完了まで待つ（Metro bundle 到着）
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 60000 });
        // 2. SPA 描画完了まで待つ：body に text があって "Generating…" 等が消えている
        //    networkidle だけだと Expo Web は空 body で抜けるため、この 2 段が要る
        await page.waitForFunction(
          () => {
            const t = document.body?.innerText || '';
            if (!t.trim()) return false;
            if (/Generating|生成中|読み込み|Loading/i.test(t)) return false;
            return true;
          },
          null, { timeout: 30000, polling: 500 }
        ).catch(() => { /* timeout でもとにかく撮る */ });
        // 3. アニメ落ち着き用の最小待機
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        const buf = await page.screenshot({ fullPage: true });
        writeFileSync(outPath, buf);

        results.push({
          component: frame.component,
          file: frame.file,
          before: phase === 'before' ? outPath : (existsSync(otherPath) ? otherPath : null),
          after:  phase === 'after'  ? outPath : (existsSync(otherPath) ? otherPath : null),
          diff: null,
          diffPixels: null,
          route: frame.route
        });
      } catch (e) {
        results.push({
          component: frame.component,
          file: frame.file,
          before: null, after: null, diff: null, diffPixels: null,
          route: frame.route,
          skipped: `screenshot failed: ${e.message.slice(0, 150)}`
        });
      }
    }
  } finally {
    await browser.close();
  }

  return { screenshots: results, outDir };
}

/**
 * pixelmatch で before/after の diff PNG を生成。
 *
 * @param {object} params
 * @param {string} params.beforePath
 * @param {string} params.afterPath
 * @param {string} params.diffPath
 * @param {number} [params.threshold=0.1] - pixelmatch threshold (0-1)
 * @returns {{diffPixels:number, width:number, height:number}}
 */
export function generateDiff({ beforePath, afterPath, diffPath, threshold = 0.1 }) {
  if (!existsSync(beforePath) || !existsSync(afterPath)) {
    throw new Error(`generateDiff: before/after PNG が不在 (before=${existsSync(beforePath)}, after=${existsSync(afterPath)})`);
  }
  const before = PNG.sync.read(readFileSync(beforePath));
  const after = PNG.sync.read(readFileSync(afterPath));

  // サイズが違う場合は小さい方に揃える（fullPage の高さは content により変わる）
  const width = Math.min(before.width, after.width);
  const height = Math.min(before.height, after.height);
  const diff = new PNG({ width, height });

  // 揃えるためにクロップ
  const cropBefore = cropOrSame(before, width, height);
  const cropAfter = cropOrSame(after, width, height);

  const diffPixels = pixelmatch(
    cropBefore.data, cropAfter.data, diff.data,
    width, height, { threshold }
  );
  writeFileSync(diffPath, PNG.sync.write(diff));
  return { diffPixels, width, height };
}

function cropOrSame(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, w, h, 0, 0);
  return out;
}
