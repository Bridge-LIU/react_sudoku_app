// Undo/Redo/Hint/Reset 工具栏。Reset 会弹二次确认（Web = confirm, Native = Alert.alert）。
//
// === Vue との対応 ===
//   Vue の <n-button disabled=""> 相当。React Native の Pressable も disabled prop を持つ。
//   ただし、無効時のスタイル切替は自動でないので、style で opacity を落として視覚的にも示す。

import React from 'react';
import { View, Pressable, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from './theme';

export interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onHint: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canHint: boolean;   // Task 7 で API 実装するまでは false
}

// Reset 二次確認：Web の Alert.alert は react-native-web 0.21 で 3 ボタン以上サポートが不完全。
// window.confirm にフォールバックすることで確実にダイアログを出す。
function confirmReset(title: string, message: string, onReset: () => void) {
  if (Platform.OS === 'web') {
    // window.confirm は同期でユーザー応答を返す。RN の Alert とは違い OK/Cancel のみ。
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(message)) {
      onReset();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'OK', onPress: onReset, style: 'destructive' },
  ]);
}

export function Toolbar(props: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.bar}>
      <Pressable
        disabled={!props.canUndo}
        onPress={props.onUndo}
        style={[styles.btn, !props.canUndo && styles.disabled]}
      >
        <Text style={[typography.button, !props.canUndo && styles.disabledText]}>{t('game.undo')}</Text>
      </Pressable>
      <Pressable
        disabled={!props.canRedo}
        onPress={props.onRedo}
        style={[styles.btn, !props.canRedo && styles.disabled]}
      >
        <Text style={[typography.button, !props.canRedo && styles.disabledText]}>{t('game.redo')}</Text>
      </Pressable>
      <Pressable
        disabled={!props.canHint}
        onPress={props.onHint}
        style={[styles.btn, !props.canHint && styles.disabled]}
      >
        <Text style={[typography.button, !props.canHint && styles.disabledText]}>{t('game.hintButton')}</Text>
      </Pressable>
      <Pressable
        onPress={() => confirmReset(t('game.reset'), t('game.resetConfirm'), props.onReset)}
        style={styles.btn}
      >
        <Text style={typography.button}>{t('game.reset')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  btn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: '#fff', borderRadius: 4 },
  disabled: { opacity: 0.4 },
  disabledText: { color: colors.disabled },
});
