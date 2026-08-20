import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, loadState, saveState, loadSnapshot, saveSnapshot } from '../scripts/lib/config.mjs';

const testRoot = join(process.cwd(), '.test-tmp');

describe('config.mjs', () => {
  beforeEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
    mkdirSync(testRoot, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(testRoot)) rmSync(testRoot, { recursive: true });
  });

  describe('loadConfig', () => {
    it('config.json を読み込んで返す', () => {
      const configPath = join(testRoot, 'config.json');
      writeFileSync(configPath, JSON.stringify({ figmaFileKey: 'abc', frames: [] }));
      const cfg = loadConfig(configPath);
      expect(cfg.figmaFileKey).toBe('abc');
    });

    it('frames の nodeId のハイフン表記をコロンに正規化', () => {
      const configPath = join(testRoot, 'config.json');
      writeFileSync(configPath, JSON.stringify({
        figmaFileKey: 'abc',
        frames: [{ nodeId: '11-1896', file: 'x.tsx', component: 'X' }]
      }));
      const cfg = loadConfig(configPath);
      expect(cfg.frames[0].nodeId).toBe('11:1896');
    });
  });

  describe('loadState / saveState', () => {
    it('state ファイルが不在なら空オブジェクトを返す', () => {
      const statePath = join(testRoot, '.figma-sync-state.json');
      expect(loadState(statePath)).toEqual({});
    });

    it('state ファイルの内容を読める', () => {
      const statePath = join(testRoot, '.figma-sync-state.json');
      writeFileSync(statePath, JSON.stringify({ last_version_id: 'v1' }));
      expect(loadState(statePath).last_version_id).toBe('v1');
    });

    it('state を書ける', () => {
      const statePath = join(testRoot, '.figma-sync-state.json');
      saveState(statePath, { last_version_id: 'v2', last_run_at: '2026-08-21T00:00:00Z' });
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
      expect(raw.last_version_id).toBe('v2');
    });
  });

  describe('loadSnapshot / saveSnapshot', () => {
    it('snapshot が不在なら null を返す', () => {
      const snapPath = join(testRoot, 'snapshots', 'last-full.json');
      expect(loadSnapshot(snapPath)).toBeNull();
    });

    it('snapshot の内容を読める', () => {
      const snapPath = join(testRoot, 'snapshots', 'last-full.json');
      mkdirSync(join(testRoot, 'snapshots'), { recursive: true });
      writeFileSync(snapPath, JSON.stringify({ version_id: 'v1', document: {} }));
      expect(loadSnapshot(snapPath).version_id).toBe('v1');
    });

    it('snapshot を書ける（親ディレクトリ自動作成）', () => {
      const snapPath = join(testRoot, 'snapshots', 'last-full.json');
      saveSnapshot(snapPath, { version_id: 'v2', document: {} });
      expect(existsSync(snapPath)).toBe(true);
    });
  });
});
