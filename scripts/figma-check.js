import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

export function assertFigmaResponse(response) {
  if (!response || typeof response !== 'object') {
    throw new Error('Figma response malformed: not an object');
  }
  if (!response.version || typeof response.version !== 'string') {
    throw new Error('Figma response malformed: missing or invalid version (check PAT or API changes)');
  }
  if (!response.lastModified || typeof response.lastModified !== 'string') {
    throw new Error('Figma response malformed: missing or invalid lastModified');
  }
}

// Rate limit / transient error retry (I3 fix + 2026-08-10 night 実測):
// Figma REST は非公開 rate limit あり、短時間連打で 429。5xx は upstream 一時障害。
// 両方共 exponential backoff で 3 回まで retry する。Retry-After header あれば優先、
// ただし 60 秒を超える場合は「長期 ban」と判断して即諦める（次回 cron に任せる）。
// 実測で Figma が Retry-After: 374210s（4.3 日）を返した事例あり、cap 必須。
const MAX_RETRY_WAIT_MS = 60000;

export async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    // 4xx (excluding 429) is non-retryable
    if (res.status !== 429 && res.status < 500) return res;
    if (attempt === retries - 1) return res; // 最終試行、そのまま返す

    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    // Retry-After が 60s 超 = 長期制限、retry しても無意味
    if (retryAfter * 1000 > MAX_RETRY_WAIT_MS) {
      console.warn(`Retry-After ${retryAfter}s exceeds ${MAX_RETRY_WAIT_MS}ms cap, aborting retries`);
      return res;
    }
    const wait = retryAfter > 0
      ? Math.min(retryAfter * 1000, MAX_RETRY_WAIT_MS)
      : Math.min(Math.pow(2, attempt) * 5000, MAX_RETRY_WAIT_MS);
    console.warn(`Figma REST ${res.status}, retry ${attempt + 1}/${retries} after ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

export async function fetchFigmaDepth1(fileKey, token) {
  const url = `https://api.figma.com/v1/files/${fileKey}?depth=1`;
  const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma REST ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// v3 state schema — 大幅簡素化。
// v2 の textSnapshot / changedTexts / perFrameHash / metaHash / diff array を全削除。
// skill 側は MCP で毎回 fresh に取るので、workflow は「変化 yes/no」の signal だけに徹する。
export const StateSchema = z.object({
  schemaVersion: z.literal(3),
  figmaVersion: z.string(),
  figmaLastModified: z.string(),
  checkedAt: z.string(),
  workflowRunId: z.number().nullable(),
  hasChanges: z.boolean(),
  fileKey: z.string(),
});

export const ConfigSchema = z.object({
  fileKey: z.string(),
  fileName: z.string().optional(),
  // frames: 監視対象の Figma nodeId 一覧。React ファイルへのマッピングは記録しない
  // — Claude が同期時に codebase を探索して該当ファイルを特定する（YAGNI + Sudoku scale）。
  frames: z.array(z.string()),
  assetsRoot: z.string().optional(),
  lastSyncedVersion: z.string().nullable(),

  // frame nodeId → lang code map (e.g. "0:1" → "ja")
  // skill L7 で subagent dispatch 時に使う。
  langMap: z.record(z.string(), z.string()).optional(),
});

export async function runCheck({ configPath, outPath, prevStatePath }) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('FIGMA_TOKEN env var not set');

  const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
  const config = ConfigSchema.parse(rawConfig);

  let prevState = null;
  if (prevStatePath) {
    try {
      const raw = await readFile(prevStatePath, 'utf8');
      prevState = StateSchema.parse(JSON.parse(raw));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.warn(`prev state load failed: ${e.message} (treating as first run)`);
      }
    }
  }

  // Only fetch depth=1 (lightweight, ~1.6 KB)
  const depth1 = await fetchFigmaDepth1(config.fileKey, token);
  assertFigmaResponse(depth1);

  // Determine hasChanges: version differs from prev OR from lastSyncedVersion
  const versionChanged = !prevState || prevState.figmaVersion !== depth1.version;
  const notYetSynced = config.lastSyncedVersion !== depth1.version;
  const hasChanges = versionChanged || notYetSynced;

  const state = {
    schemaVersion: 3,
    figmaVersion: depth1.version,
    figmaLastModified: depth1.lastModified,
    checkedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
    hasChanges,
    fileKey: config.fileKey,
  };

  StateSchema.parse(state);
  await writeFile(outPath, JSON.stringify(state, null, 2));
  console.log(`v3 state written: figmaVersion=${depth1.version} hasChanges=${hasChanges}`);
  return { hasChanges, figmaVersion: depth1.version };
}

async function main() {
  const { values } = parseArgs({
    options: {
      // v3: diff logic 廃止、内部は version compare のみ。
      // backward compat のため --pull-and-diff / --pull-only flag を受け付けるが、意味は同じ。
      'pull-and-diff': { type: 'boolean' },
      'pull-only': { type: 'boolean' },
      check: { type: 'boolean' },
      config: { type: 'string', default: '.figma-sync.json' },
      out: { type: 'string', default: '/tmp/state.json' },
      'prev-state': { type: 'string' },
    },
  });

  if (!values['pull-and-diff'] && !values['pull-only'] && !values.check) {
    console.error('Usage: figma-check.js --check [--prev-state <path>] [--config <path>] [--out <path>]');
    process.exit(2);
  }

  await runCheck({
    configPath: values.config,
    outPath: values.out,
    prevStatePath: values['prev-state'],
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
