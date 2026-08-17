import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import stringify from 'fast-json-stable-stringify';
import { z } from 'zod';

export function canonicalize(obj) {
  return stringify(obj);
}

export function sha256(str) {
  return 'sha256:' + createHash('sha256').update(str).digest('hex');
}

export function findNode(tree, nodeId) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.id === nodeId) return tree;
  for (const child of tree.children || []) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function extractTextNodes(node) {
  const result = {};
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'TEXT' && n.id) {
      result[n.id] = { text: n.characters || '' };
    }
    for (const child of n.children || []) {
      walk(child);
    }
  }
  walk(node);
  return result;
}

export function extractTextSnapshot(tree, registeredIds) {
  const result = {};
  for (const id of registeredIds) {
    const node = findNode(tree, id);
    if (node) {
      result[id] = extractTextNodes(node);
    }
  }
  return result;
}

export function diffTextSnapshots(prev, curr) {
  const changes = [];
  const prevSnap = prev || {};
  const allFrameIds = new Set([...Object.keys(prevSnap), ...Object.keys(curr)]);

  for (const frameId of allFrameIds) {
    const prevTexts = prevSnap[frameId] || {};
    const currTexts = curr[frameId] || {};
    const allTextIds = new Set([...Object.keys(prevTexts), ...Object.keys(currTexts)]);

    for (const textId of allTextIds) {
      const before = prevTexts[textId]?.text ?? null;
      const after = currTexts[textId]?.text ?? null;

      if (before === null && after !== null) {
        changes.push({ frameId, textLayerId: textId, before: null, after, action: 'added' });
      } else if (before !== null && after === null) {
        changes.push({ frameId, textLayerId: textId, before, after: null, action: 'removed' });
      } else if (before !== after) {
        changes.push({ frameId, textLayerId: textId, before, after, action: 'modified' });
      }
    }
  }
  return changes;
}

export function computePerFrameHash(tree, registeredIds) {
  const result = {};
  for (const id of registeredIds) {
    const node = findNode(tree, id);
    if (node) {
      result[id] = sha256(canonicalize(node));
    }
  }
  return result;
}

// 漏検リスク #1・#2 対応：frame 子樹外の共有 style / component 定義を捕捉
export function computeMetaHash(fileResponse) {
  const meta = {
    styles: fileResponse.styles || {},
    components: fileResponse.components || {},
    componentSets: fileResponse.componentSets || {},
  };
  return sha256(canonicalize(meta));
}

export function diffHashes(prev, curr) {
  const prevMap = prev || {};
  const prevKeys = new Set(Object.keys(prevMap));
  const currKeys = new Set(Object.keys(curr));

  const changed = [];
  const added = [];
  const removed = [];

  for (const id of currKeys) {
    if (!prevKeys.has(id)) {
      added.push(id);
    } else if (prevMap[id] !== curr[id]) {
      changed.push(id);
    }
  }
  for (const id of prevKeys) {
    if (!currKeys.has(id)) {
      removed.push(id);
    }
  }

  return {
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
  };
}

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

export function assertHashStability(tree, registeredIds) {
  const first = computePerFrameHash(tree, registeredIds);
  const second = computePerFrameHash(tree, registeredIds);
  for (const id of registeredIds) {
    if (first[id] !== second[id]) {
      throw new Error(`Hash non-deterministic for ${id} (canonical serializer bug)`);
    }
  }
}

export function assertDiffDisjoint({ changed, added, removed }) {
  const c = new Set(changed);
  const a = new Set(added);
  const r = new Set(removed);
  for (const id of c) {
    if (a.has(id)) throw new Error(`Diff set overlap: ${id} in changed and added`);
    if (r.has(id)) throw new Error(`Diff set overlap: ${id} in changed and removed`);
  }
  for (const id of a) {
    if (r.has(id)) throw new Error(`Diff set overlap: ${id} in added and removed`);
  }
}

// Rate limit / transient error retry (I3 fix + 2026-08-10 night 実測):
// Figma REST は非公開 rate limit あり、短時間連打で 429。5xx は upstream 一時障害。
// 両方共 exponential backoff で 3 回まで retry する。Retry-After header あれば優先、
// ただし 60 秒を超える場合は「長期 ban」と判断して即諦める（次回 cron に任せる）。
// 実測で Figma が Retry-After: 374210s（4.3 日）を返した事例あり、cap 必須。
const MAX_RETRY_WAIT_MS = 60000;

async function fetchWithRetry(url, options, retries = 3) {
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

export async function fetchFigmaFull(fileKey, token) {
  const url = `https://api.figma.com/v1/files/${fileKey}`;
  const res = await fetchWithRetry(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma REST ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const TextSnapshotSchema = z.record(
  z.string(),
  z.record(z.string(), z.object({ text: z.string(), style: z.string().optional() }))
);

export const ChangedTextSchema = z.object({
  frameId: z.string(),
  textLayerId: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  action: z.enum(['added', 'modified', 'removed']),
});

export const StateSchema = z.object({
  checkedAt: z.string(),
  workflowRunId: z.number().nullable(),
  fileKey: z.string(),
  figmaVersion: z.string(),
  figmaLastModified: z.string(),
  treeHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  metaHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  perFrameHash: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  changedSinceLastRun: z.array(z.string()),
  added: z.array(z.string()),
  removed: z.array(z.string()),
  metaChanged: z.boolean(),

  // v2 optional (backward compat with v1 state)
  schemaVersion: z.literal(2).optional(),
  textSnapshot: TextSnapshotSchema.optional(),
  changedTexts: z.array(ChangedTextSchema).optional(),
});

export const ConfigSchema = z.object({
  fileKey: z.string(),
  fileName: z.string().optional(),
  // frames: 監視対象の Figma nodeId 一覧。React ファイルへのマッピングは記録しない
  // — Claude が同期時に codebase を探索して該当ファイルを特定する（YAGNI + Sudoku scale）。
  frames: z.array(z.string()),
  assetsRoot: z.string().optional(),
  lastSyncedVersion: z.string().nullable(),

  // v2 optional: frame nodeId → lang code map (e.g. "0:1" → "ja")
  // 未定義なら v1 の暗黙順序フォールバック（frames[0]=ja, frames[1]=zh, ...）
  langMap: z.record(z.string(), z.string()).optional(),
});

export async function runCheck({ configPath, outPath, prevStatePath }) {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error('FIGMA_TOKEN env var not set');

  // Load and validate config
  const rawConfig = JSON.parse(await readFile(configPath, 'utf8'));
  const config = ConfigSchema.parse(rawConfig);
  const registeredIds = config.frames;

  // Load previous state if provided (may not exist on first run)
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

  // Fetch depth=1 to get version
  const depth1 = await fetchFigmaDepth1(config.fileKey, token);
  assertFigmaResponse(depth1);

  // Early exit if version unchanged
  if (prevState && prevState.figmaVersion === depth1.version) {
    const state = {
      ...prevState,
      checkedAt: new Date().toISOString(),
      workflowRunId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      // reset diff arrays since we're up-to-date
      changedSinceLastRun: [],
      added: [],
      removed: [],
      metaChanged: false,
      // v2: preserve textSnapshot, empty changedTexts (no change)
      schemaVersion: 2,
      textSnapshot: prevState.textSnapshot || {},
      changedTexts: [],
    };
    StateSchema.parse(state);
    await writeFile(outPath, JSON.stringify(state, null, 2));
    console.log(`no change (figma version ${depth1.version} matches prev state)`);
    return { changed: [], added: [], removed: [], metaChanged: false };
  }

  // Fetch full tree
  const full = await fetchFigmaFull(config.fileKey, token);
  assertFigmaResponse(full);

  // Compute per-frame hashes (with stability check)
  assertHashStability(full.document, registeredIds);
  const currHashes = computePerFrameHash(full.document, registeredIds);
  const currMetaHash = computeMetaHash(full);

  // Diff
  const prevHashes = prevState?.perFrameHash || null;
  const diff = diffHashes(prevHashes, currHashes);
  assertDiffDisjoint(diff);

  // 漏検リスク #1・#2 対応: metaHash 変化検出
  const metaChanged = prevState ? (prevState.metaHash !== currMetaHash) : true;

  // v2: text snapshot + diff
  // 「first run（prev なし）」は baseline とみなし changedTexts=[] にする
  // → skill が「全 text を added として apply」する事故を防ぐ
  const currTextSnapshot = extractTextSnapshot(full.document, registeredIds);
  const prevTextSnapshot = prevState?.textSnapshot || null;
  const changedTexts = prevTextSnapshot === null
    ? []
    : diffTextSnapshots(prevTextSnapshot, currTextSnapshot);

  // Build state
  const state = {
    checkedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
    fileKey: config.fileKey,
    figmaVersion: full.version,
    figmaLastModified: full.lastModified,
    treeHash: sha256(canonicalize(full.document)),
    metaHash: currMetaHash,
    perFrameHash: currHashes,
    changedSinceLastRun: diff.changed,
    added: diff.added,
    removed: diff.removed,
    metaChanged,
    // v2
    schemaVersion: 2,
    textSnapshot: currTextSnapshot,
    changedTexts,
  };

  StateSchema.parse(state); // 自検 ②

  await writeFile(outPath, JSON.stringify(state, null, 2));
  console.log(`state written: ${diff.changed.length} changed, ${diff.added.length} added, ${diff.removed.length} removed, metaChanged=${metaChanged}`);
  return { ...diff, metaChanged };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'pull-and-diff': { type: 'boolean' },
      'pull-only': { type: 'boolean' },
      config: { type: 'string', default: '.figma-sync.json' },
      out: { type: 'string', default: '/tmp/state.json' },
      'prev-state': { type: 'string' },
    },
  });

  if (!values['pull-and-diff'] && !values['pull-only']) {
    console.error('Usage: figma-check.js --pull-and-diff [--prev-state <path>] [--config <path>] [--out <path>]');
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
