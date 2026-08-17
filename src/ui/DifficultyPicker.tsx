// 首页的难度选择界面。3 个 bento pill (mint / peach / coral) で難度を色分け。

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Difficulty } from '@/types/domain';
import { colors, spacing, typography, bento } from './theme';

export interface DifficultyPickerProps {
  onPick: (d: Difficulty) => void;
}

// 難度 → bento pill 色 (視覚的にも「軽い→重い」を示唆)
// hard は言語別（Figma 準拠）: ZH=blue, JP=red, EN=coral(既存 fallback)
const difficultyColorBase: Record<Difficulty, string> = {
  easy: colors.mint,
  medium: colors.peach,
  hard: colors.hardBtn,  // JP デフォルト
};

function pickHardColor(lang: string): string {
  if (lang === 'zh') return colors.hardBtnBlue;
  if (lang === 'en') return colors.coral;
  return colors.hardBtn;  // ja + fallback
}

export function DifficultyPicker(props: DifficultyPickerProps) {
  const { t, i18n } = useTranslation();
  const options: Difficulty[] = ['easy', 'medium', 'hard'];
  const difficultyColor: Record<Difficulty, string> = {
    ...difficultyColorBase,
    hard: pickHardColor(i18n.language),
  };
  // Figma strict SoT (sync5): JP page 内は「難易度を選択3」を render（他 lang は共通 title）
  const titleKey = i18n.language === 'ja' ? 'difficulty.titleJp3' : 'difficulty.title';
  return (
    <View style={styles.container}>
      <Text style={typography.h1}>{t(titleKey)}</Text>
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
            <Text style={[typography.h2, { color: colors.ink }]}>{t(`difficulty.${d}`)}</Text>
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
    gap: spacing.xl,
    padding: spacing.xl,
  },
  buttons: { gap: spacing.md, width: '100%', maxWidth: 320 },
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.lg,
    alignItems: 'center',
    ...bento.offsetShadow,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
