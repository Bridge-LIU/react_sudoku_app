// expo-localization スタブ (Vitest 用)
// 実本体は Flow 構文で書かれており Vitest でパース不能なため、Node 環境のテストでは
// このスタブに差し替える。detectInitialLanguage() は fallback 'ja' を返す。

export function getLocales(): { languageCode: string | null }[] {
  return [{ languageCode: 'ja' }];
}
