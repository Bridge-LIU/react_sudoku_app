import { describe, it, expect, beforeEach } from 'vitest';
import { handleGeneratePuzzle, handleGetPuzzle, _debugPuzzleCache, _getPuzzleById } from '../handlers/puzzles';
import { puzzleObjectSchema } from '../schemas/puzzle';
import { errorResponseSchema } from '../schemas/common';

describe('puzzles handler', () => {
  beforeEach(() => {
    _debugPuzzleCache().clear();
  });

  it('POST /puzzles/generate returns schema-valid puzzle for easy', () => {
    const res = handleGeneratePuzzle({ difficulty: 'easy' });
    expect(res.status).toBe(200);
    const parsed = puzzleObjectSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.difficulty).toBe('easy');
      expect(parsed.data.puzzle.length).toBe(81);
      expect(parsed.data.solution.length).toBe(81);
      expect(parsed.data.clueCount).toBeGreaterThanOrEqual(36);
    }
  }, 20000);

  it('POST /puzzles/generate rejects invalid difficulty', () => {
    const res = handleGeneratePuzzle({ difficulty: 'ultra' });
    expect(res.status).toBe(400);
    const parsed = errorResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.errorCode).toBe('INVALID_REQUEST');
  });

  it('POST /puzzles/generate caches by id, GET returns same object', () => {
    const gen = handleGeneratePuzzle({ difficulty: 'easy' });
    expect(gen.status).toBe(200);
    const puzzle = puzzleObjectSchema.parse(gen.body);
    const get = handleGetPuzzle(`/puzzles/${puzzle.id}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(puzzle);
  }, 20000);

  it('GET unknown id returns 404 PUZZLE_NOT_FOUND', () => {
    const res = handleGetPuzzle('/puzzles/nonexistent_id');
    expect(res.status).toBe(404);
    const parsed = errorResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.errorCode).toBe('PUZZLE_NOT_FOUND');
  });

  it('_getPuzzleById exposes solution for hint handler', () => {
    const gen = handleGeneratePuzzle({ difficulty: 'easy' });
    const puzzle = puzzleObjectSchema.parse(gen.body);
    const fetched = _getPuzzleById(puzzle.id);
    expect(fetched).toBeDefined();
    expect(fetched?.solution.length).toBe(81);
  }, 20000);
});
