import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Phase 6: Excel 報告書生成（Python 経由）
 *
 * `06-report.py <run-dir>` を呼ぶ。runDir 直下の test-results.json / diff.json /
 * screenshots/ を Python 側が読んで v10 template を埋め、runDir/report.xlsx を出力。
 */
export async function generateReport({ config, runDir }) {
  const figmaSyncDir = config.reactAppRoot
    ? join(config.reactAppRoot, 'scripts/figma-sync')
    : 'scripts/figma-sync';

  const res = spawnSync('python', ['scripts/06-report.py', runDir], {
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
