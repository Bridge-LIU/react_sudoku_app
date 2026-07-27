/**
 * Mock ルーター：path/method で handler にディスパッチ。
 *
 * 使い方: アプリ起動時に一度 `installMocks()` を呼ぶ (app/_layout.tsx で)。
 * これで httpClient が Mock を経由するようになる。USE_MOCKS=false のときは効かない。
 *
 * === 設計思想 ===
 *   MSW (Mock Service Worker) を使わなかった理由 (設計書 §5.3):
 *     RN runtime での MSW 対応が不完全。Web/iOS/Android で統一動作させるため in-process 分派。
 */

import { registerMockDispatcher, USE_MOCKS, type MockDispatcher } from '@/api/httpClient';
import { handleGeneratePuzzle, handleGetPuzzle } from './handlers/puzzles';
import { handleSaveGame } from './handlers/savedGames';
import { handleRequestHint } from './handlers/hints';
import { handleAnalyticsEvent } from './handlers/analytics';

// 実 fetch の feel に近づける遅延 (loading spinner を実際に見せる)。
// テスト (Vitest) では 0 にして throughput を落とさない。
const MOCK_LATENCY_MS =
  typeof process !== 'undefined' && (process.env?.VITEST || process.env?.NODE_ENV === 'test') ? 0 : 30;

const dispatchMock: MockDispatcher = async (opts) => {
  if (MOCK_LATENCY_MS > 0) {
    await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
  }

  const { method, path, body } = opts;

  // POST /puzzles/generate
  if (method === 'POST' && path === '/puzzles/generate') {
    return handleGeneratePuzzle(body);
  }
  // GET /puzzles/:id
  if (method === 'GET' && path.startsWith('/puzzles/')) {
    return handleGetPuzzle(path);
  }
  // PUT /savedGames/:id
  if (method === 'PUT' && path.startsWith('/savedGames/')) {
    return handleSaveGame(path, body);
  }
  // POST /hints
  if (method === 'POST' && path === '/hints') {
    return handleRequestHint(body);
  }
  // POST /analytics/play
  if (method === 'POST' && path === '/analytics/play') {
    return handleAnalyticsEvent(body);
  }

  // 未登録のパス
  return { status: 404, body: { errorCode: 'MOCK_ROUTE_NOT_FOUND', message: `${method} ${path}` } };
};

let installed = false;

/**
 * Mock を httpClient に登録。多重登録防止のため installed フラグでガード。
 * USE_MOCKS=false のときは呼んでも no-op (dispatcher が使われない)。
 */
export function installMocks(): void {
  if (installed) return;
  installed = true;
  registerMockDispatcher(dispatchMock);
}

export { USE_MOCKS };
