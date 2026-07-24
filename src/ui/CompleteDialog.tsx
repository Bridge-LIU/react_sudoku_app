// 完成弹窗。用 RN 的 Modal 实现（原生半透明背景 + 卡片）。

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from './theme';
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
  const time = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return (
    <Modal transparent visible={props.visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={typography.h1}>{t('game.complete')}</Text>
          <Text style={{ marginTop: spacing.md }}>
            {/* t 支持 {{插值}} —— 对比 Vue i18n 用法一致 */}
            {t('game.completeStats', {
              difficulty: t(`difficulty.${props.difficulty}`),
              time,
              mistakes: props.mistakes,
              hints: props.hintsUsed,
            })}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={props.onPlayAgain}><Text>Play again</Text></Pressable>
            <Pressable onPress={props.onChangeDifficulty}><Text>Change difficulty</Text></Pressable>
            <Pressable onPress={props.onClose}><Text>Close</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.boardBg, padding: spacing.xl, borderRadius: 8, minWidth: 280 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
