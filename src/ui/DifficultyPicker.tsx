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
const difficultyColor: Record<Difficulty, string> = {
  easy: colors.mint,
  medium: colors.peach,
  hard: colors.coral,
};

export function DifficultyPicker(props: DifficultyPickerProps) {
  const { t } = useTranslation();
  const options: Difficulty[] = ['easy', 'medium', 'hard'];
  return (
    <View style={styles.container}>
      <Text style={typography.h1}>{t('difficulty.title')}</Text>
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
