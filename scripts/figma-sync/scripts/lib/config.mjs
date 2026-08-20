import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadConfig(configPath) {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (Array.isArray(raw.frames)) {
    raw.frames = raw.frames.map(f => ({
      ...f,
      nodeId: f.nodeId.replace('-', ':')
    }));
  }
  return raw;
}

export function loadState(statePath) {
  if (!existsSync(statePath)) return {};
  return JSON.parse(readFileSync(statePath, 'utf-8'));
}

export function saveState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

export function loadSnapshot(snapshotPath) {
  if (!existsSync(snapshotPath)) return null;
  return JSON.parse(readFileSync(snapshotPath, 'utf-8'));
}

export function saveSnapshot(snapshotPath, snapshot) {
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf-8');
}
