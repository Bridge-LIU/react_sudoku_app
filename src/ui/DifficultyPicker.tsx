// 首页的难度选择界面。Figma node 6:9 準拠：3 個の bento pill (mint / peach / coral)。
// 2026-08-21 Figma 完全対齊：
//   - タイトルとボタン文言を i18n から日本語ハードコードへ切替（Figma 6:11 / 6:15 / 6:18 / 6:21 準拠）
//   - padding 26/18、font weight 700（Figma 6:13）
//   - 多言語対応は Home からは一時的に外れる（後日方針再検討）

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Difficulty } from '@/types/domain';
import { colors, spacing, typography, bento } from './theme';

export interface DifficultyPickerProps {
  onPick: (d: Difficulty) => void;
}

// 難度 → bento pill 色 (視覚的にも「軽い→重い」を示唆) — Figma 6:13/6:16/6:19 と一致
const difficultyColor: Record<Difficulty, string> = {
  easy: colors.mint,
  medium: colors.peach,
  hard: colors.coral,
};

// Figma 準拠のラベル（i18n は撤廃）
const difficultyLabel: Record<Difficulty, string> = {
  easy: '初級',
  medium: '中級',
  hard: '上級',
};

export function DifficultyPicker(props: DifficultyPickerProps) {
  const options: Difficulty[] = ['easy', 'medium', 'hard'];
  return (
    <View style={styles.container}>
      <Text style={styles.title}>難易度を選択</Text>
      <View style={styles.buttons}>
        {options.map(d => (
          <Pressable
            key={d}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: difficultyColor[d] },
              pressed && styles.pressed,
            ]}
            onPress={() => props.onPick(d)}
          >
            <Text style={styles.btnLabel}>{difficultyLabel[d]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl, // Figma 6:9: item-spacing s+ (24px)
    padding: spacing.xl, // Figma 6:9: p-[24px]
  },
  // Figma 6:11: font-size 30 / weight 700 / letterSpacing -0.5
  title: { ...typography.h1, fontWeight: '700' as const, color: colors.ink },
  buttons: { gap: spacing.md, width: '100%', maxWidth: 320 },
  btn: {
    // Figma 6:13: px 26 / py 18
    paddingHorizontal: 26,
    paddingVertical: 18,
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.lg,
    alignItems: 'center',
    ...bento.offsetShadow,
  },
  // Figma 6:15/6:18/6:21: font-size 20 / weight 700 / letterSpacing -0.3 / color #141414
  btnLabel: { ...typography.h2, fontWeight: '700' as const, color: colors.ink },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
