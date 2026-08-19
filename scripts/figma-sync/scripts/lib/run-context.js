import fs from 'node:fs';
import path from 'node:path';

export function createRunDir(root) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const dir = path.join(root, 'runs', ts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function promoteSnapshot(snapshotsRoot) {
  const cur = path.join(snapshotsRoot, 'current', 'dump.json');
  const prevDir = path.join(snapshotsRoot, 'previous');
  fs.mkdirSync(prevDir, { recursive: true });
  const prev = path.join(prevDir, 'dump.json');
  fs.renameSync(cur, prev);
}

export function writeStatus(runDir, status) {
  fs.writeFileSync(path.join(runDir, 'status.txt'), status + '\n');
}
