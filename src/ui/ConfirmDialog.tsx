// 汎用確認ダイアログ。Bento 風: CompleteDialog と同じ overlay + card + 3D pill。
//
// === 使い方 ===
//   <ConfirmDialog
//     visible={open}
//     title={t('game.reset')}
//     message={t('game.resetConfirm')}
//     onConfirm={() => { open=false; actualReset(); }}
//     onCancel={() => open=false}
//     destructive  // 確認ボタンを危険色 (primary=hot pink) に
//   />
//
// === Vue 対比 ===
//   Vue の <ConfirmDialog v-model:visible> 相当。React では visible + onCancel を
//   親から明示的に渡すのが慣例（SSOT）。中で自分の visible を勝手に false にはしない。

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, bento } from './theme';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 確認ボタンを破壊的アクション色 (hot pink) にする。false なら青。 */
  destructive?: boolean;
  /** ラベル差し替え（省略時は i18n 標準）。 */
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmLabel = props.confirmLabel ?? t('common.ok');
  const cancelLabel = props.cancelLabel ?? t('common.cancel');
  const confirmBg = props.destructive ? colors.primary : colors.secondary;
  const confirmText = props.destructive ? colors.textOnPrimary : colors.textOnDark;

  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={[typography.h1, { color: colors.ink }]}>{props.title}</Text>
          <Text style={styles.message}>{props.message}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={props.onCancel}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: colors.peach },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={[typography.buttonSmall, { color: colors.ink }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={props.onConfirm}
              style={({ pressed }) => [
                styles.actionBtn,
                { backgroundColor: confirmBg },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={[typography.buttonSmall, { color: confirmText }]}>{confirmLabel}</Text>
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
    minWidth: 280,
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.sm,
    ...bento.offsetShadow,
  },
  message: {
    marginTop: spacing.xs,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  actionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 90,
    alignItems: 'center',
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
