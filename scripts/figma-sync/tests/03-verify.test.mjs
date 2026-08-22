import { describe, it, expect } from 'vitest';
import { computeVerifyOutcome } from '../scripts/03-verify.mjs';

it('returns PASS when diff ratio below threshold', () => {
  expect(computeVerifyOutcome({ diffPixels: 5, totalPixels: 1000, threshold: 0.1 }))
    .toEqual({ status: 'PASS', ratio: 0.005 });
});

it('returns FAIL when diff exceeds threshold', () => {
  expect(computeVerifyOutcome({ diffPixels: 300, totalPixels: 1000, threshold: 0.1 }))
    .toEqual({ status: 'FAIL', ratio: 0.3 });
});

it('handles zero total pixels safely (returns FAIL with ratio 1)', () => {
  expect(computeVerifyOutcome({ diffPixels: 0, totalPixels: 0, threshold: 0.1 }))
    .toEqual({ status: 'FAIL', ratio: 1 });
});
