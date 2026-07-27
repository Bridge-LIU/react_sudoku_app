/**
 * Analytics handler (Mock)。
 * - POST /analytics/play → 202 (fire-and-forget)
 *
 * 実 Azure Functions では Application Insights に送信するが、Mock は console.log と
 * in-memory buffer だけ。テスト側で送信内容を検査できるように expose する。
 */

import { analyticsRequestSchema, AnalyticsRequest } from '@/mocks/schemas/analytics';

const events: AnalyticsRequest[] = [];

export function handleAnalyticsEvent(rawBody: unknown): { status: number; body: unknown } {
  const parsed = analyticsRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { errorCode: 'INVALID_REQUEST' } };
  }
  events.push(parsed.data);
  // 202 Accepted: 非同期処理受付。fire-and-forget は body 空 object。
  return { status: 202, body: {} };
}

// テスト用：受信済みイベント参照 / リセット
export function _debugAnalyticsBuffer() {
  return {
    events: [...events] as readonly AnalyticsRequest[],
    clear: () => { events.length = 0; },
  };
}
