// 首页 / 路径。文件路径决定路由：src/app/index.tsx → 应用打开时的首屏。
// Figma node 6:9「難易度を選択」準拠。
// 2026-08-21 変更：Figma 6:9 には LanguageSwitch が描かれていないため削除、
//                  DifficultyPicker 単体構成に簡素化（gap/padding は DifficultyPicker 側で吸収）。

import React from 'react';
import { useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { DifficultyPicker } from '@/ui/DifficultyPicker';
import { colors } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <DifficultyPicker onPick={d => router.push(`/play/${d}`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
