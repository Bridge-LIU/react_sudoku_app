import { spawn } from 'node:child_process';
import { join } from 'node:path';

/**
 * Phase 6: Excel 報告書生成（Python 経由）
 *
 * `06-report.py <run-dir>` を呼ぶ。runDir 直下の各 phase 出力 + state / config /
 * git log を Python 側が集約して v11 template を埋め、runDir/report.xlsx を出力。
 *
 * Python の stderr は user 端末にリアルタイム流す（sheet 生成 progress 表示）。
 */
export async function generateReport({ config, runDir }) {
  const figmaSyncDir = config.reactAppRoot
    ? join(config.reactAppRoot, 'scripts/figma-sync')
    : 'scripts/figma-sync';

  return await new Promise((resolve) => {
    const child = spawn('python', ['scripts/06-report.py', runDir], {
      cwd: figmaSyncDir,
      shell: false,
      stdio: ['ignore', 'pipe', 'inherit'],  // stderr を親端末に inherit（progress log を live 表示）
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },  // Windows cp932 事故対策
    });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr: '',  // stderr は inherit のため個別 capture なし
        reportPath: join(runDir, 'report.xlsx'),
      });
    });

    child.on('error', (err) => {
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: err.message,
        reportPath: join(runDir, 'report.xlsx'),
      });
    });
  });
}
