import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function filterActiveThreads(comments) {
  return comments.filter((c) => c.resolved_at === null && c.parent_id === '');
}

function toJstString(isoUtc) {
  const d = new Date(isoUtc);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())} JST`;
}

function pinLink(fileKey, comment) {
  const base = `https://www.figma.com/file/${fileKey}`;
  const nodeId = comment.client_meta?.node_id;
  const nodePart = nodeId ? `?node-id=${nodeId.replace(':', '-')}` : '';
  return `${base}${nodePart}#comment=${comment.id}`;
}

export function formatCommentList(comments, { fileKey }) {
  if (comments.length === 0) {
    return '未処理コメントなし。';
  }
  const lines = [`=== Figma 未処理コメント ${comments.length} 件 ===`, ''];
  comments.forEach((c, i) => {
    const author = c.user?.handle ?? '(unknown)';
    const jst = toJstString(c.created_at);
    const nodeId = c.client_meta?.node_id ?? '(no pin)';
    const link = pinLink(fileKey, c);
    lines.push(`[${i + 1}] ${jst} | ${author}`);
    lines.push(`    node: ${nodeId}`);
    lines.push(`    msg : ${c.message}`);
    lines.push(`    link: ${link}`);
    lines.push('');
  });
  return lines.join('\n');
}

export async function fetchComments(fileKey, token, { fetchFn = fetch } = {}) {
  const url = `https://api.figma.com/v1/files/${fileKey}/comments`;
  let res;
  try {
    res = await fetchFn(url, { headers: { 'X-Figma-Token': token } });
  } catch (e) {
    throw new Error(`Figma comments fetch failed (network): ${e.message}`);
  }
  if (!res.ok) {
    const body = typeof res.text === 'function' ? await res.text() : '';
    throw new Error(`Figma REST ${res.status}: ${String(body).slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const configPath = new URL('../.figma-sync.json', import.meta.url);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    console.error('FIGMA_TOKEN env var not set');
    process.exit(1);
  }
  const raw = await fetchComments(config.fileKey, token);
  const active = filterActiveThreads(raw.comments);
  console.log(formatCommentList(active, { fileKey: config.fileKey }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
