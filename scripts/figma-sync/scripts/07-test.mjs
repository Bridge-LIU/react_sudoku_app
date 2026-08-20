import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 5: 全套テスト実行 + coverage 集計
 */
export async function runTests({ config, runDir }) {
  mkdirSync(runDir, { recursive: true });

  const results = {
    unit: null,
    e2e: null,
    audit: null,
    coverage: null
  };

  // Unit + integration + component
  const unitRes = spawnSync('npm', ['test', '--', '--coverage'], {
    cwd: config.reactAppRoot,
    encoding: 'utf-8',
    shell: true
  });
  results.unit = {
    exitCode: unitRes.status,
    stdout: unitRes.stdout,
    stderr: unitRes.stderr
  };

  // E2E
  const e2eRes = spawnSync('npm', ['run', 'test:e2e'], {
    cwd: config.reactAppRoot,
    encoding: 'utf-8',
    shell: true
  });
  results.e2e = {
    exitCode: e2eRes.status,
    stdout: e2eRes.stdout,
    stderr: e2eRes.stderr
  };

  // npm audit
  const auditRes = spawnSync('npm', ['audit', '--json'], {
    cwd: config.reactAppRoot,
    encoding: 'utf-8',
    shell: true
  });
  results.audit = {
    exitCode: auditRes.status,
    json: (() => { try { return JSON.parse(auditRes.stdout); } catch { return null; } })()
  };

  // coverage/coverage-summary.json
  const covPath = join(config.reactAppRoot, 'coverage/coverage-summary.json');
  if (existsSync(covPath)) {
    results.coverage = JSON.parse(readFileSync(covPath, 'utf-8'));
  }

  writeFileSync(join(runDir, 'test-results.json'), JSON.stringify(results, null, 2));

  return results;
}
