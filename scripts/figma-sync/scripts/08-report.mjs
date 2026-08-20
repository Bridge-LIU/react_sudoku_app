import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Phase 6: Excel 報告書生成（Python 経由）
 */
export async function generateReport({ config, runDir, testResults, nodeDiffs, fallbackTriggered }) {
  const args = [
    join('scripts', 'lib', 'excel_fill.py'),
    '--run-dir', runDir,
    '--template', 'templates/sudoku_テスト実施報告書_本番版_2026-07-30_v10.xlsx',
    '--output', join(runDir, 'report.xlsx')
  ];

  if (fallbackTriggered) {
    args.push('--fallback-flag');
  }

  const figmaSyncDir = config.reactAppRoot
    ? join(config.reactAppRoot, 'scripts/figma-sync')
    : join('scripts/figma-sync');

  const res = spawnSync('python', args, {
    cwd: figmaSyncDir,
    encoding: 'utf-8',
    shell: false
  });

  return {
    exitCode: res.status,
    stdout: res.stdout,
    stderr: res.stderr,
    reportPath: join(runDir, 'report.xlsx')
  };
}
