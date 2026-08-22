import { spawn, spawnSync } from 'node:child_process';
import { openSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * dev server 静默起動/停止ヘルパ。
 *
 * - Windows で `windowsHide:true` + `detached:true` により console 窓を出さない
 * - 既存 server が port で応答すれば起動を skip し `reused:true` を返す
 * - reused の時は stopSilentDevServer で kill しない（他セッションを守る）
 * - ready 判定は log file から `Waiting on http://` を polling
 */

const READY_PATTERNS = [/Waiting on http:\/\//i, /Web is waiting on/i, /Metro waiting on/i];

/**
 * @param {string} url e.g. http://localhost:8081
 * @returns {Promise<boolean>}
 */
async function probePort(url) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    return resp.status < 500;
  } catch {
    return false;
  }
}

/**
 * @param {object} params
 * @param {object} params.config          - figma-sync config
 * @param {string} params.logPath         - server stdout/stderr 書き先
 * @param {number} [params.readyTimeoutMs=90000]
 * @returns {Promise<{pid:number|null, reused:boolean, logPath:string}>}
 */
export async function startSilentDevServer({ config, logPath, readyTimeoutMs = 90000 }) {
  const url = config.devServer?.url;
  if (!url) throw new Error('startSilentDevServer: config.devServer.url が未設定');

  if (await probePort(url)) {
    return { pid: null, reused: true, logPath };
  }

  mkdirSync(dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, 'w');

  const cmd = config.devServer.cmd || 'npm run web';
  const [bin, ...args] = cmd.split(/\s+/);
  // Windows で `npm` は `.cmd` shim。shell:true で cmd.exe 経由起動する
  const child = spawn(bin, args, {
    cwd: config.reactAppRoot,
    stdio: ['ignore', logFd, logFd],
    detached: true,
    windowsHide: true,
    shell: true,
    env: { ...process.env, CI: '1', BROWSER: 'none', EXPO_NO_TELEMETRY: '1' }
  });
  child.unref();

  // ready polling: log 出現 or port up の早い方
  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    await delay(1000);
    // log 出力チェック
    if (existsSync(logPath)) {
      try {
        const buf = readFileSync(logPath, 'utf-8');
        if (READY_PATTERNS.some(p => p.test(buf))) {
          // log 出ても実際に port が上がるまで 1-2 秒待つ
          for (let i = 0; i < 10; i++) {
            if (await probePort(url)) return { pid: child.pid, reused: false, logPath };
            await delay(500);
          }
        }
      } catch { /* file lock 一瞬あり得る、次 iter で再試行 */ }
    }
    // fallback: port だけで判定
    if (await probePort(url)) return { pid: child.pid, reused: false, logPath };
  }

  // 失敗 → 生かして返してもデバッグしづらいので kill
  try { stopSilentDevServer({ pid: child.pid, reused: false }); } catch { /* noop */ }
  throw new Error(`startSilentDevServer: ${readyTimeoutMs}ms 内に ${url} が上がらなかった。log=${logPath}`);
}

/**
 * @param {{pid:number|null, reused:boolean}} handle
 */
export function stopSilentDevServer({ pid, reused }) {
  if (reused || !pid) return { killed: false, reason: 'reused_or_no_pid' };
  // Windows: taskkill /F /T で子プロセスツリー全滅
  const res = spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { encoding: 'utf-8' });
  return { killed: res.status === 0, status: res.status, stderr: res.stderr };
}
