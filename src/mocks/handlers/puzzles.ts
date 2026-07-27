/**
 * Puzzles handler (Mock)。
 * - POST /puzzles/generate  → 新規パズルを生成して返す
 * - GET  /puzzles/:id       → 過去に生成したものを返す (in-memory キャッシュ)
 *
 * 実 Azure Functions では Cosmos DB に保存して ID で引くが、Mock は Map で足りる。
 */

import { generatePuzzleRequestSchema, PuzzleObject } from '@/mocks/schemas/puzzle';
import { generateFixture } from '@/mocks/fixtures';

// 生成したパズルは in-memory キャッシュ。ページリロードで消えるが Mock なので OK。
const cache = new Map<string, PuzzleObject>();

/**
 * POST /puzzles/generate
 * @throws Error on invalid request (handler が 400 body を返すため)
 */
export function handleGeneratePuzzle(rawBody: unknown): { status: number; body: unknown } {
  const parsed = generatePuzzleRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { errorCode: 'INVALID_REQUEST', message: 'difficulty missing or invalid' } };
  }
  const puzzle = generateFixture(parsed.data.difficulty);
  cache.set(puzzle.id, puzzle);
  return { status: 200, body: puzzle };
}

/**
 * GET /puzzles/:id
 * path から id を抽出して cache 検索。
 */
export function handleGetPuzzle(path: string): { status: number; body: unknown } {
  // path = "/puzzles/puzzle_000001"
  const id = path.split('/').pop() ?? '';
  const puzzle = cache.get(id);
  if (!puzzle) {
    return { status: 404, body: { errorCode: 'PUZZLE_NOT_FOUND' } };
  }
  return { status: 200, body: puzzle };
}

// テスト用：キャッシュ状態を検査/リセット
export function _debugPuzzleCache() {
  return {
    size: cache.size,
    clear: () => cache.clear(),
  };
}

/**
 * ID で puzzle を引く内部 API。他 handler (hints 等) から solution を参照するために公開。
 * "_" prefix は「Mock 実装内部用、外部から呼ばないで」の signal。
 */
export function _getPuzzleById(id: string): PuzzleObject | undefined {
  return cache.get(id);
}
