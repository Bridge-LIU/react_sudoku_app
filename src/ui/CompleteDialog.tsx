// 完成弹窗。Bento: chunky rounded card + カラフルアクションボタン。
// アクションラベルは i18n key 経由 (game.playAgain / changeDifficulty / close)。

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, bento } from './theme';
import { Difficulty } from '@/types/domain';

export interface CompleteDialogProps {
  visible: boolean;
  difficulty: Difficulty;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  onPlayAgain: () => void;
  onChangeDifficulty: () => void;
  onClose: () => void;
}

export function CompleteDialog(props: CompleteDialogProps) {
  const { t } = useTranslation();
  const s = Math.floor(props.elapsedMs / 1000);
  const time = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <Modal transparent visible={props.visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>🎉</Text>
          <Text style={[typography.h1, { color: colors.ink }]}>{t('game.complete')}</Text>
          <Text style={styles.stats}>
            {t('game.completeStats', {
              difficulty: t(`difficulty.${props.difficulty}`),
              time,
              mistakes: props.mistakes,
              hints: props.hintsUsed,
            })}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={props.onPlayAgain}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.secondary },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typography.buttonSmall, { color: colors.textOnDark }]}>{t('game.playAgain')}</Text>
            </Pressable>
            <Pressable
              onPress={props.onChangeDifficulty}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.mint },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typography.buttonSmall, { color: colors.ink }]}>{t('game.changeDifficulty')}</Text>
            </Pressable>
            <Pressable
              onPress={props.onClose}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.peach },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[typography.buttonSmall, { color: colors.ink }]}>{t('game.close')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,20,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.boardBg,
    padding: spacing.xl,
    borderRadius: bento.radius.xl,
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    minWidth: 300,
    maxWidth: 380,
    alignItems: 'center',
    gap: spacing.sm,
    ...bento.offsetShadow,
  },
  title: { fontSize: 44 },
  stats: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.md,
    ...bento.offsetShadow,
  },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
