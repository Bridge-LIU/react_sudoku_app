/**
 * SavedGames API: 途中セーブの永続化 (将来 Cosmos 連携)。
 * S 範囲では PlayScreen は AsyncStorage を優先し、これは契約テスト用。
 */

import { httpRequest } from './httpClient';
import { savedGameRequestSchema, savedGameResponseSchema, SavedGameRequest, SavedGameResponse } from '@/mocks/schemas/savedGame';

/**
 * PUT /api/savedGames/:id
 */
export function saveGame(id: string, payload: SavedGameRequest): Promise<SavedGameResponse> {
  return httpRequest(
    { method: 'PUT', path: `/savedGames/${encodeURIComponent(id)}`, body: payload },
    savedGameResponseSchema,
    savedGameRequestSchema
  );
}
