// 首页 / 路径。文件路径决定路由：src/app/index.tsx → 应用打开时的首屏。
// 右上角に言語切替 pill、中央に難易度選択。

import React from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, Platform, StatusBar, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DifficultyPicker } from '@/ui/DifficultyPicker';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { colors, spacing, typography } from '@/ui/theme';

// Figma strict SoT (sync5): 各言語 page で難度タイトルの表示個数と位置が異なる
//   JP: 3 個 distinct（「難易度を選択1/2/3」）— 選択1 は home.title の上、
//       選択2 は home.title の下、選択3 は DifficultyPicker 内
//   ZH: 2 個（「选择难度」を 2 stack）— 1 個 extra + DifficultyPicker 内
//   EN: 1 個（DifficultyPicker 内のみ）
// DifficultyPicker 内で言語別に 1 個 render するため、ここで page 上の extras を追加する。
type ExtraLayout = { before: string[]; after: string[] };
function extraTitleLayout(lang: string): ExtraLayout {
  if (lang === 'ja') {
    // Figma 位置: 選択1 (y=169.5) → home.title (y=228.5) → 選択2 (y=287.5)
    return { before: ['difficulty.titleJp1'], after: ['difficulty.titleJp2'] };
  }
  if (lang === 'zh') {
    // ZH は home.title の下に 1 個 追加
    return { before: [], after: ['difficulty.title'] };
  }
  return { before: [], after: [] };
}

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  // ZH page Figma のみ LanguageSwitch を duplicate（Figma strict SoT 準拠、sync4）
  const showDuplicateLangSwitch = i18n.language === 'zh';
  const layout = extraTitleLayout(i18n.language);
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
        {layout.before.map((key, i) => (
          <Text key={`before-difftitle-${i}`} style={typography.h1}>
            {t(key)}
          </Text>
        ))}
        <Text style={typography.h2}>{t('home.title')}</Text>
        {layout.after.map((key, i) => (
          <Text key={`after-difftitle-${i}`} style={typography.h1}>
            {t(key)}
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
