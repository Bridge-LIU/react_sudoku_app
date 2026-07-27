import { describe, it, expect, beforeEach } from 'vitest';
import { handleAnalyticsEvent, _debugAnalyticsBuffer } from '../handlers/analytics';

describe('analytics handler', () => {
  beforeEach(() => {
    _debugAnalyticsBuffer().clear();
  });

  it('accepts PuzzleCompleted event with 202 and buffers it', () => {
    const res = handleAnalyticsEvent({
      eventName: 'PuzzleCompleted',
      properties: {
        difficulty: 'medium',
        puzzleId: 'puzzle_001',
        durationMs: 60_000,
        mistakes: 0,
        hintsUsed: 0,
        undoCount: 2,
        appVersion: '0.1.0',
      },
    });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({});
    const buf = _debugAnalyticsBuffer();
    expect(buf.events.length).toBe(1);
    expect(buf.events[0]?.eventName).toBe('PuzzleCompleted');
  });

  it('rejects unknown eventName', () => {
    const res = handleAnalyticsEvent({
      eventName: 'UnknownEvent',
      properties: {},
    });
    expect(res.status).toBe(400);
  });

  it('accepts events with custom properties (catchall)', () => {
    const res = handleAnalyticsEvent({
      eventName: 'HintUsed',
      properties: {
        difficulty: 'hard',
        customBoolField: true,
        customStringField: 'foo',
      },
    });
    expect(res.status).toBe(202);
  });
});
