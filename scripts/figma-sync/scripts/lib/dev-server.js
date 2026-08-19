// Helper: spawn / wait / kill dev server (Metro / Vite / etc.)
// Cross-platform. On Windows uses taskkill to kill the process tree
// because spawning through a shell leaves grandchildren.

import { spawn } from 'node:child_process';
import net from 'node:net';

export function spawnDevServer(cwd, cmd) {
  // cmd example: "npm run web"
  const [prog, ...args] = cmd.split(' ');
  const proc = spawn(prog, args, {
    cwd,
    shell: true,
    stdio: 'ignore', // no console pollution
    detached: false,
  });
  return proc;
}

export function waitForPort(port, host = '127.0.0.1', timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ port, host });
      socket.once('connect', () => { socket.end(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        }
        setTimeout(tryConnect, 500);
      });
    };
    tryConnect();
  });
}

export function killDevServer(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      // Kill the whole tree (shell + grandchildren)
      spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
        shell: true,
        stdio: 'ignore',
      });
    } else {
      proc.kill('SIGTERM');
    }
  } catch (_e) {
    // best effort
  }
}
