// 首页 / 路径。文件路径决定路由：src/app/index.tsx → 应用打开时的首屏。
// 右上角に言語切替 pill、中央に難易度選択。

import React from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, Platform, StatusBar, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DifficultyPicker } from '@/ui/DifficultyPicker';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { colors, spacing, typography } from '@/ui/theme';

// Figma strict SoT (sync4): 各言語 page で難度タイトルの表示個数が異なる
//   JP: 3 個（Figma で「難易度を選択」を 3 stack）
//   ZH: 2 個（Figma で「選択難度」相当を 2 stack）
//   EN: 1 個（Figma 変化なし）
// DifficultyPicker 内で 1 個 render するため、ここで extras を追加する。
function extraTitleCount(lang: string): number {
  if (lang === 'ja') return 2;  // + DifficultyPicker 内の 1 = 合計 3
  if (lang === 'zh') return 1;  // + 1 = 合計 2
  return 0;                     // EN は 1 のまま
}

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  // ZH page Figma のみ LanguageSwitch を duplicate（Figma strict SoT 準拠、sync4）
  const showDuplicateLangSwitch = i18n.language === 'zh';
  const extras = extraTitleCount(i18n.language);
  return (
    <View style={styles.container}>
      {/* 右上角の言語切替。position absolute で他レイアウトに影響させない。 */}
      <View style={styles.langSwitchWrap}>
        <LanguageSwitch />
        {showDuplicateLangSwitch && (
          <View style={{ marginTop: spacing.xs }}>
            <LanguageSwitch />
          </View>
        )}
      </View>
      <View style={styles.titleWrap}>
        <Text style={typography.h2}>{t('home.title')}</Text>
        {Array.from({ length: extras }).map((_, i) => (
          <Text key={`dup-difftitle-${i}`} style={typography.h1}>
            {t('difficulty.title')}
          </Text>
        ))}
      </View>
      <DifficultyPicker onPick={d => router.push(`/play/${d}`)} />
    </View>
  );
}

// Android の StatusBar 高さ (ノッチ分)。iOS/Web は safe area 側で吸収されるので 0。
const statusBarInset = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  langSwitchWrap: {
    position: 'absolute',
    top: spacing.md + statusBarInset,
    right: spacing.md,
    zIndex: 10,
  },
  titleWrap: {
    alignItems: 'center',
    paddingTop: spacing.xl * 3,
  },
});
