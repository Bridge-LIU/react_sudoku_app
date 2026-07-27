// Expo Router 的根 Layout。类似 Vue Router 里的顶层 <RouterView>，但 Expo Router 是文件系统路由。
// 这里也是挂载全局 provider（i18n、GameProvider、ErrorBoundary）的地方。
//
// === Vue との対応 ===
//   Vue の App.vue で <Provider>...</Provider> を書くのと同じ。
//   Pinia の createPinia().install(app) ≒ GameProvider で children をラップ。
//   Vue の app.config.errorHandler ≒ ErrorBoundary + window.onerror の組合せ。

import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import '@/i18n';   // 副作用初始化 i18next，见 src/i18n/index.ts
import { GameProvider } from '@/state/gameContext';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

// エラーをログするヘルパー：本番の共有デバイスでも安全な情報のみ残す。
// e.error / e.reason 全体を出すとスタックにファイルパスや今後の AI プロンプト内容が漏れる可能性。
function redact(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name, message: err.message };
  if (typeof err === 'string') return { name: 'Error', message: err };
  return { name: 'Error', message: 'Unknown error' };
}

// Fast Refresh 対策：Native ErrorUtils は「元に戻す」術がないので、
// 同一プロセス内で二度と install しないよう globalThis に marker を置く。
const GLOBAL_HANDLER_MARK = '__sudokuGlobalHandlerInstalled__' as const;

export default function RootLayout() {
  // グローバル例外ハンドラ：ErrorBoundary は「レンダー中の例外」しか捕捉しない。
  // イベントハンドラ内の throw、Promise rejection、setTimeout 内エラーはここで拾う。
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onError = (e: ErrorEvent) => {
        console.error('[window.onerror]', redact(e.error ?? e.message));
      };
      const onRejection = (e: PromiseRejectionEvent) => {
        console.error('[unhandledrejection]', redact(e.reason));
      };
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      };
    }
    // React Native 側：ErrorUtils（グローバルオブジェクト、Web にはない）
    const g = globalThis as unknown as Record<string, unknown> & {
      ErrorUtils?: {
        setGlobalHandler?: (h: (err: Error, isFatal?: boolean) => void) => void;
      };
    };
    // 既に install 済みなら何もしない（Fast Refresh で effect 再実行されても多重ラップしない）
    if (g[GLOBAL_HANDLER_MARK]) return;
    g[GLOBAL_HANDLER_MARK] = true;
    g.ErrorUtils?.setGlobalHandler?.((err, isFatal) => {
      console.error('[GlobalHandler]', redact(err), { isFatal });
    });
    // Native の cleanup は無し（RootLayout は unmount しない前提、既存 handler も復元しない方針）
  }, []);

  // Provider ネスト順：
  //   ErrorBoundary が最外 → 内側の Provider や Screen のクラッシュを捕捉
  //   GameProvider は Screen より外 → useGameState が有効になる
  return (
    <ErrorBoundary>
      <GameProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </GameProvider>
    </ErrorBoundary>
  );
}
