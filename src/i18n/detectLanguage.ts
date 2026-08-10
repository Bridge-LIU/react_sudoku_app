// 端末言語検出 (pure helper — i18n / state 両方から参照される)
// Vue 対比: composable の初期化ロジックを純関数として切り出したもの。

import * as Localization from 'expo-localization';

const SUPPORTED = { ja: 'ja', zh: 'zh', en: 'en' } as const;

export type SupportedLang = keyof typeof SUPPORTED;

export function detectInitialLanguage(): SupportedLang {
  const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? 'ja';
  return (SUPPORTED as Record<string, SupportedLang>)[deviceLanguage] ?? 'ja';
}
