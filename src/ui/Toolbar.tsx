// Undo/Redo/Hint/Reset 工具栏。Reset 会弹原生 Alert 二次确认。

import React from 'react';
import { View, Pressable, Text, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing } from './theme';

export interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onHint: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function Toolbar(props: ToolbarProps) {
  const { t } = useTranslation();
  const confirmReset = () => {
    // Alert.alert 是 RN 原生弹窗（iOS/Android 弹原生 Dialog，Web 端弹浏览器 confirm）
    Alert.alert(t('game.reset'), t('game.resetConfirm'), [
      { text: 'Cancel' },
      { text: 'OK', onPress: props.onReset, style: 'destructive' },
    ]);
  };
  return (
    <View style={styles.bar}>
      <Pressable disabled={!props.canUndo} onPress={props.onUndo}><Text>{t('game.undo')}</Text></Pressable>
      <Pressable disabled={!props.canRedo} onPress={props.onRedo}><Text>{t('game.redo')}</Text></Pressable>
      <Pressable onPress={props.onHint}><Text>{t('game.hintButton')}</Text></Pressable>
      <Pressable onPress={confirmReset}><Text>{t('game.reset')}</Text></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm },
});
