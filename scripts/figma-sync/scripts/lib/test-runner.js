export function parseVitestJson(json) {
  const cases = [];
  for (const suite of json.testResults || []) {
    for (const tc of suite.assertionResults || []) {
      cases.push({
        file: suite.name, title: tc.title,
        status: tc.status, duration: tc.duration || 0,
      });
    }
  }
  return {
    total: json.numTotalTests || 0,
    passed: json.numPassedTests || 0,
    failed: json.numFailedTests || 0,
    cases,
  };
}

export const parseJestJson = parseVitestJson; // Jest json shape is compatible

export function aggregateCoverage(vitestCov, jestCov) {
  const pct = (a, b, key) => ((a?.total?.[key]?.pct || 0) + (b?.total?.[key]?.pct || 0)) / 2;
  return {
    line: pct(vitestCov, jestCov, 'lines'),
    branch: pct(vitestCov, jestCov, 'branches'),
    statement: pct(vitestCov, jestCov, 'statements'),
    function: pct(vitestCov, jestCov, 'functions'),
  };
}
