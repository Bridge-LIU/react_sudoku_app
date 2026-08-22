import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { startSilentDevServer, stopSilentDevServer } from './lib/dev-server.mjs';

/**
 * Pure function: given diff pixel count and total pixel count, return PASS/FAIL + ratio.
 * - `threshold` here is the *ratio* of allowed diff pixels (0-1).
 * - Not to be confused with pixelmatch's per-pixel color tolerance.
 * - totalPixels=0 は比較不能なので FAIL, ratio 1 で返す。
 *
 * @param {{diffPixels:number,totalPixels:number,threshold:number}} params
 * @returns {{status:'PASS'|'FAIL', ratio:number}}
 */
export function computeVerifyOutcome({ diffPixels, totalPixels, threshold }) {
  if (!totalPixels) return { status: 'FAIL', ratio: 1 };
  const ratio = diffPixels / totalPixels;
  return { status: ratio > threshold ? 'FAIL' : 'PASS', ratio };
}

/**
 * Integration: launch dev server + Playwright, screenshot each changed frame's route,
 * pixel-diff against the Figma-side PNG saved at _tmp/candidate/<safeNodeId>.png.
 *
 * @param {object} params
 * @param {object} params.config          - figma-sync config
 * @param {string} params.runDir          - _tmp/<runId>/ directory to write diff PNGs + dev log
 * @param {Array<{nodeId:string, route?:string}>} params.changedFrames
 * @param {string} params.syncRoot        - scripts/figma-sync absolute path
 * @returns {Promise<Array<{nodeId:string,status:string,ratio?:number,diff_png?:string,reason?:string}>>}
 */
export async function verifyFrames({ config, runDir, changedFrames, syncRoot }) {
  const results = [];
  const devLogPath = join(runDir, 'dev-server.log');
  const dev = await startSilentDevServer({ config, logPath: devLogPath });
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: config.playwright?.viewport ?? { width: 1440, height: 900 }
    });
    for (const frame of changedFrames) {
      if (!frame.route) {
        results.push({ nodeId: frame.nodeId, status: 'SKIPPED', reason: 'no route' });
        continue;
      }
      const page = await ctx.newPage();
      const url = `${config.devServer.url}${frame.route}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const shotBuf = await page.screenshot({ fullPage: false });
      await page.close();

      const safe = frame.nodeId.replace(/:/g, '-');
      const figmaPngPath = join(syncRoot, '_tmp', 'candidate', `${safe}.png`);
      if (!existsSync(figmaPngPath)) {
        results.push({ nodeId: frame.nodeId, status: 'SKIPPED', reason: 'no figma png' });
        continue;
      }
      const outcome = comparePng(shotBuf, readFileSync(figmaPngPath), config.pixelmatchThreshold ?? 0.1);
      const diffPath = join(runDir, `verify_${safe}.png`);
      writeFileSync(diffPath, outcome.diffPngBuf);
      results.push({
        nodeId: frame.nodeId, status: outcome.status, ratio: outcome.ratio, diff_png: diffPath
      });
    }
  } finally {
    await browser.close();
    if (!dev.reused) stopSilentDevServer(dev);
  }
  return results;
}

/**
 * Compare two PNG buffers (RGBA). If dimensions differ, crop to the min WxH.
 * pixelmatch's `threshold` (hard-coded 0.1) is per-pixel color tolerance.
 * `computeVerifyOutcome`'s threshold is the ratio ceiling.
 */
function comparePng(aBuf, bBuf, threshold) {
  const a = PNG.sync.read(aBuf);
  const b = PNG.sync.read(bBuf);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  const outcome = computeVerifyOutcome({ diffPixels, totalPixels: width * height, threshold });
  return { ...outcome, diffPngBuf: PNG.sync.write(diff) };
}
