// 首页 / 路径。文件路径决定路由：src/app/index.tsx → 应用打开时的首屏。
// 右上角に言語切替 pill、中央に難易度選択。

import React from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet, Platform, StatusBar, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DifficultyPicker } from '@/ui/DifficultyPicker';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { colors, spacing, typography } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {/* 右上角の言語切替。position absolute で他レイアウトに影響させない。 */}
      <View style={styles.langSwitchWrap}>
        <LanguageSwitch />
      </View>
      <View style={styles.titleWrap}>
        <Text style={typography.h2}>{t('home.title')}</Text>
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
