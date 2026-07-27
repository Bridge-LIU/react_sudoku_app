/**
 * SavedGames handler (Mock)。
 * - PUT /savedGames/:id → 保存 (or 更新) して {id, updatedAt} を返す
 *
 * S 範囲では PlayScreen 側は AsyncStorage を使うので、この Mock は将来の Cosmos 連携
 * に備えた「契約テストのみ通す」実装で良い。
 */

import { savedGameRequestSchema } from '@/mocks/schemas/savedGame';

const store = new Map<string, unknown>();

export function handleSaveGame(path: string, rawBody: unknown): { status: number; body: unknown } {
  const id = path.split('/').pop() ?? '';
  if (!id) {
    return { status: 400, body: { errorCode: 'INVALID_ID' } };
  }
  const parsed = savedGameRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { errorCode: 'INVALID_REQUEST' } };
  }
  store.set(id, parsed.data);
  return { status: 200, body: { id, updatedAt: new Date().toISOString() } };
}

export function _debugSavedGamesStore() {
  return {
    size: store.size,
    clear: () => store.clear(),
  };
}
