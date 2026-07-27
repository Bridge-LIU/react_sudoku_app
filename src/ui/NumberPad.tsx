// 数字パッド 1-9 + 削除 + メモ切替。
// Bento: chunky 2px 黒枠 + 10px rounded + offset shadow で「押せる」立体感。
// 押下時は translate で shadow 消して沈む感覚。

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { NonEmptyDigit } from '@/types/domain';
import { colors, spacing, typography, bento } from './theme';
import { useTranslation } from 'react-i18next';

export interface NumberPadProps {
  memoMode: boolean;
  onNumber: (d: NonEmptyDigit) => void;
  onDelete: () => void;
  onToggleMode: () => void;
  disabled: boolean;
}

export function NumberPad(props: NumberPadProps) {
  const { t } = useTranslation();
  const numbers: NonEmptyDigit[] = [1,2,3,4,5,6,7,8,9];
  return (
    <View style={styles.container}>
      {/* 1-9 の数字ボタン列 */}
      <View style={styles.row}>
        {numbers.map(n => (
          <Pressable
            key={n}
            style={({ pressed }) => [
              styles.numBtn,
              props.disabled && styles.disabled,
              pressed && !props.disabled && styles.pressed,
            ]}
            onPress={() => props.onNumber(n)}
            disabled={props.disabled}
          >
            <Text style={[typography.cellNumber, { color: colors.ink }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      {/* 削除 + メモ切替 */}
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={props.onDelete}
        >
          <Text style={[typography.button, { color: colors.ink }]}>{t('game.delete')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            props.memoMode && styles.memoActive,
            pressed && styles.pressed,
          ]}
          onPress={props.onToggleMode}
        >
          <Text style={[typography.button, { color: props.memoMode ? colors.textOnPrimary : colors.ink }]}>
            {t('game.memoMode')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.sm, gap: spacing.xs, alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing.xs },
  numBtn: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.md,
    ...bento.offsetShadow,
  },
  actionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.md,
    ...bento.offsetShadow,
  },
  memoActive: { backgroundColor: colors.primary },
  disabled: { opacity: 0.4 },
  // 押下時: shadow を消して 2px 沈む
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
