/**
 * HTTP クライアント：Mock / 実 Azure Functions の分派点。
 *
 * === 設計原則 (設計書 §5.3) ===
 *   USE_MOCKS = true  → src/mocks/index.ts の dispatchMock を呼ぶ (in-process)
 *   USE_MOCKS = false → fetch() で apiBaseUrl 経由 Azure Functions を叩く
 *
 *   API 層 (src/api/*.ts) はどちらでも同じインターフェースで呼べる。
 *   切替は Constants.expoConfig.extra.useMocks 一箇所だけ。
 *
 * === Vue との対応 ===
 *   axios の instance に近い。ただしここでは axios ではなく素の fetch + 手書きラッパー。
 */

import Constants from 'expo-constants';
import { z } from 'zod';
import { NetworkError, TimeoutError, HttpError, SchemaError } from './errors';
import { errorResponseSchema } from '@/mocks/schemas/common';

// app.config.ts の extra を読む。両方 fallback を用意して null safety を担保。
const extra = (Constants.expoConfig?.extra ?? {}) as {
  useMocks?: boolean;
  apiBaseUrl?: string;
};
export const USE_MOCKS: boolean = extra.useMocks ?? true;
export const API_BASE_URL: string = extra.apiBaseUrl ?? '/api';

// タイムアウト既定値 (実 Azure Functions は数秒で返る想定)
const DEFAULT_TIMEOUT_MS = 15_000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method: HttpMethod;
  path: string;              // "/puzzles/generate" のような相対パス (先頭に /)
  body?: unknown;
  timeoutMs?: number;
}

export type MockDispatcher = (opts: RequestOptions) => Promise<{ status: number; body: unknown }>;

let registeredMockDispatcher: MockDispatcher | null = null;
export function registerMockDispatcher(fn: MockDispatcher): void {
  registeredMockDispatcher = fn;
}

/**
 * HTTP 呼出し + zod 検証。
 *
 * requestSchema を渡すと、送信前に body を検証する (client 側でも contract violation を早期検出)。
 * responseSchema はレスポンス body を実行時検証。検証失敗は SchemaError を投げる。
 *
 * === エラー階層 ===
 *   TimeoutError:  制限時間内にレスポンス無し
 *   HttpError:     status >= 400、errorCode 付きで詳細
 *   NetworkError:  fetch 自体が失敗 (offline / DNS / CORS)
 *   SchemaError:   response body が schema に合致しない
 *   その他:         mock dispatcher 内の例外はそのまま bubble (プログラミングバグの隠蔽防止)
 */
export async function httpRequest<T>(
  opts: RequestOptions,
  responseSchema: z.ZodType<T>,
  requestSchema?: z.ZodType<unknown>
): Promise<T> {
  // Request 側 zod 検証：client 側でも contract 破りを早期検出 (Azure に投げる前に落とす)
  if (requestSchema && opts.body !== undefined) {
    const parsed = requestSchema.safeParse(opts.body);
    if (!parsed.success) {
      throw new SchemaError(parsed.error.issues);
    }
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // callWithTimeout で発生する例外は既に適切な型 (Timeout/Network/Http) or mock 由来。
  // ここでは再ラップせずそのまま透過させる (診断精度優先)。
  const raw = await callWithTimeout(opts, timeoutMs);

  // 4xx/5xx: errorResponse として解釈試行
  if (raw.status >= 400) {
    const parsed = errorResponseSchema.safeParse(raw.body);
    if (parsed.success) {
      throw new HttpError(raw.status, parsed.data.errorCode, parsed.data.message);
    }
    throw new HttpError(raw.status);
  }

  // 2xx: schema 検証
  const result = responseSchema.safeParse(raw.body);
  if (!result.success) {
    throw new SchemaError(result.error.issues);
  }
  return result.data;
}

async function callWithTimeout(
  opts: RequestOptions,
  timeoutMs: number
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (USE_MOCKS) {
      if (!registeredMockDispatcher) {
        throw new Error('USE_MOCKS=true but no mock dispatcher registered');
      }
      // Mock は in-process。dispatcher 内の例外は「プログラミングバグ」なので
      // NetworkError にすり替えず bubble させる (デバッグ時に true stack が見える)。
      // ここで race するのは timeout 発火のためだけ。
      return await Promise.race([
        registeredMockDispatcher(opts),
        new Promise<never>((_, reject) => {
          // { once: true } で abort 後にリスナー自動解除 (leak 防止)
          controller.signal.addEventListener(
            'abort',
            () => reject(new TimeoutError(timeoutMs)),
            { once: true }
          );
        }),
      ]);
    }

    // 実 fetch。fetch 自体の失敗のみを NetworkError にラップ、
    // それ以外の異常 (JSON parse は body 化して継続) は素の Error で伝搬。
    let res: Response;
    try {
      res = await fetch(API_BASE_URL + opts.path, {
        method: opts.method,
        headers: { 'Content-Type': 'application/json' },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        throw new TimeoutError(timeoutMs);
      }
      throw new NetworkError(err);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;   // JSON でない → schema 検証で拾わせる
      }
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
