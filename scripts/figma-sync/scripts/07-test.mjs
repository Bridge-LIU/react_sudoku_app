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
  // React app has test:engine (vitest), test:components (jest), test:e2e (playwright)
  // No plain "test" script → use test:engine and test:components explicitly
  const engineRes = spawnSync('npm', ['run', 'test:engine'], {
    cwd: config.reactAppRoot,
    encoding: 'utf-8',
    shell: true
  });
  const componentsRes = spawnSync('npm', ['run', 'test:components'], {
    cwd: config.reactAppRoot,
    encoding: 'utf-8',
    shell: true
  });
  results.unit = {
    engine: { exitCode: engineRes.status, stdout: engineRes.stdout, stderr: engineRes.stderr },
    components: { exitCode: componentsRes.status, stdout: componentsRes.stdout, stderr: componentsRes.stderr },
    exitCode: (engineRes.status === 0 && componentsRes.status === 0) ? 0 : 1
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
