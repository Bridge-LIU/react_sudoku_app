/**
 * API 層エラーの階層。UI 側はこの型を catch して分岐できる。
 *
 * === Vue との対応 ===
 *   axios の AxiosError のような専用クラス階層。
 *   ここでは Error のサブクラスなので `err instanceof ApiError` で判別可能。
 */

/** API 呼出しで起きた全エラーの親クラス */
export class ApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/** ネットワーク到達不可 (offline / DNS 失敗 / CORS 拒否等) */
export class NetworkError extends ApiError {
  constructor(cause?: unknown) {
    super('Network error', cause);
    this.name = 'NetworkError';
  }
}

/** タイムアウト (指定時間内にレスポンスが返らなかった) */
export class TimeoutError extends ApiError {
  constructor(readonly timeoutMs: number) {
    super(`Timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** サーバー側エラーレスポンス (HTTP 4xx/5xx) */
export class HttpError extends ApiError {
  constructor(readonly status: number, readonly errorCode?: string, message?: string) {
    super(message ?? `HTTP ${status}${errorCode ? ` (${errorCode})` : ''}`);
    this.name = 'HttpError';
  }
}

/** レスポンス schema 違反 (Azure が想定外の形を返した / Mock 実装バグ) */
export class SchemaError extends ApiError {
  constructor(readonly issues: unknown) {
    super('Response failed schema validation');
    this.name = 'SchemaError';
  }
}
