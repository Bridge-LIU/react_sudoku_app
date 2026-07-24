// 动态路由：src/app/play/[difficulty].tsx → 匹配 /play/easy, /play/medium, /play/hard。
// 对比 Vue Router: 相当于 { path: '/play/:difficulty', component: PlayScreen }。
// 这一 Task 只是静态展示 —— state 接线放在 Task 6。

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Board } from '@/ui/Board';
import { NumberPad } from '@/ui/NumberPad';
import { Toolbar } from '@/ui/Toolbar';
import { colors, spacing } from '@/ui/theme';
import { Board as BoardData } from '@/types/domain';

// 演示用的空盘面（81 格全 0）
const EMPTY_BOARD = new Array(81).fill(0) as BoardData;

export default function PlayScreen() {
  // useLocalSearchParams 拿路由参数，类似 Vue 的 useRoute().params
  const { difficulty } = useLocalSearchParams<{ difficulty: string }>();
  return (
    <View style={styles.container}>
      <Board
        board={EMPTY_BOARD}
        initialBoard={EMPTY_BOARD}
        notes={{}}
        selectedIndex={null}
        highlights={{ sameLine: new Set(), sameNumber: new Set() }}
        conflicts={new Set()}
        onCellPress={() => {}}
      />
      <NumberPad memoMode={false} onNumber={() => {}} onDelete={() => {}} onToggleMode={() => {}} disabled={false} />
      <Toolbar
        onUndo={() => {}} onRedo={() => {}} onHint={() => {}} onReset={() => {}}
        canUndo={false} canRedo={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingTop: spacing.xl },
});
