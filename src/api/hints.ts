/**
 * Hints API: AI (Azure OpenAI) 由来のヒント取得。
 *
 * === 信用境界 ===
 *   1. zod で schema 検証 (httpRequest 内部で実施)
 *   2. UI 側で engine.hintVerifier.verify() を必ず呼ぶ (BAF: AI 出力の二重検証)
 *   2 段階通過して初めて盤面に書き込む。
 */

import { httpRequest } from './httpClient';
import { hintRequestSchema, hintResponseSchema, HintRequest, HintResponse } from '@/mocks/schemas/hint';

/**
 * POST /api/hints
 */
export function requestHint(payload: HintRequest): Promise<HintResponse> {
  return httpRequest(
    { method: 'POST', path: '/hints', body: payload },
    hintResponseSchema,
    hintRequestSchema
  );
}
