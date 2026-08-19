import { describe, it, expect } from 'vitest';
import { parseVitestJson, parseJestJson, aggregateCoverage } from '../scripts/lib/test-runner.js';

describe('test-runner parsers', () => {
  it('parseVitestJson extracts pass/fail counts', () => {
    const sample = {
      numTotalTests: 100, numPassedTests: 98, numFailedTests: 2,
      testResults: [{ name: 'foo.test.js', assertionResults: [{ title: 't1', status: 'passed', duration: 5 }] }],
    };
    const r = parseVitestJson(sample);
    expect(r.total).toBe(100);
    expect(r.passed).toBe(98);
    expect(r.failed).toBe(2);
    expect(r.cases).toHaveLength(1);
  });

  it('aggregateCoverage merges vitest + jest coverage', () => {
    const v = { total: { lines: { pct: 90 }, branches: { pct: 80 } } };
    const j = { total: { lines: { pct: 70 }, branches: { pct: 60 } } };
    const r = aggregateCoverage(v, j);
    expect(r.line).toBeCloseTo(80);
    expect(r.branch).toBeCloseTo(70);
  });
});
