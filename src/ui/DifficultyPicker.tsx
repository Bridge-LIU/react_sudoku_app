// 首页的难度选择界面。3 个按钮。

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Difficulty } from '@/types/domain';
import { colors, spacing, typography } from './theme';

export interface DifficultyPickerProps {
  onPick: (d: Difficulty) => void;
}

export function DifficultyPicker(props: DifficultyPickerProps) {
  const { t } = useTranslation();
  const options: Difficulty[] = ['easy', 'medium', 'hard'];
  return (
    <View style={styles.container}>
      <Text style={typography.h1}>{t('difficulty.title')}</Text>
      {options.map(d => (
        <Pressable key={d} style={styles.btn} onPress={() => props.onPick(d)}>
          <Text style={[typography.button, { color: '#fff' }]}>{t(`difficulty.${d}`)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  btn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: colors.primary, borderRadius: 8 },
});
