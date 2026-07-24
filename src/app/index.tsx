// 首页 / 路径。文件路径决定路由：src/app/index.tsx → 应用打开时的首屏。

import React from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { DifficultyPicker } from '@/ui/DifficultyPicker';
import { colors } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter(); // 对比 Vue: useRouter() 也一样
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <DifficultyPicker onPick={d => router.push(`/play/${d}`)} />
    </View>
  );
}
