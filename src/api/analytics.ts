/**
 * Analytics API: fire-and-forget イベント送信。
 * エラーが起きても UI 側は無視 (プレイを止めない)。
 */

import { httpRequest } from './httpClient';
import { analyticsRequestSchema, analyticsResponseSchema, AnalyticsRequest, AnalyticsResponse } from '@/mocks/schemas/analytics';

/**
 * POST /api/analytics/play
 * 例外は握りつぶす。呼び出し側で catch 不要。
 */
export function sendAnalyticsEvent(event: AnalyticsRequest): Promise<AnalyticsResponse | null> {
  return httpRequest(
    { method: 'POST', path: '/analytics/play', body: event },
    analyticsResponseSchema,
    analyticsRequestSchema
  ).catch((err) => {
    // analytics 失敗はプレイ体験を止めない (設計書 §10)
    console.warn('[analytics]', err instanceof Error ? err.message : String(err));
    return null;
  });
}
