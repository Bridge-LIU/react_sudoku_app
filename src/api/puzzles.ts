/**
 * Puzzles API: フロント向け型付き呼出し。内部で httpClient に委譲。
 * Mock / 実 Azure Functions の切替は httpClient が担当する。
 */

import { httpRequest } from './httpClient';
import { puzzleObjectSchema, generatePuzzleRequestSchema, PuzzleObject } from '@/mocks/schemas/puzzle';
import { Difficulty } from '@/types/domain';

/**
 * POST /api/puzzles/generate
 * @param difficulty 難易度
 * @returns 生成されたパズル (puzzle + solution)
 */
export function generatePuzzle(difficulty: Difficulty): Promise<PuzzleObject> {
  return httpRequest(
    { method: 'POST', path: '/puzzles/generate', body: { difficulty } },
    puzzleObjectSchema,
    generatePuzzleRequestSchema
  );
}

/**
 * GET /api/puzzles/:id
 * @throws HttpError (404 = PUZZLE_NOT_FOUND)
 */
export function getPuzzle(id: string): Promise<PuzzleObject> {
  return httpRequest(
    { method: 'GET', path: `/puzzles/${encodeURIComponent(id)}` },
    puzzleObjectSchema
  );
}
