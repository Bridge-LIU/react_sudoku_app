// Undo/Redo/Hint/Reset 工具栏。Bento: 各アクションを異なる bento pill 色で。
// Reset は Web 上で window.confirm、Native では Alert.alert (Alert が Web で不完全なため)。

import React from 'react';
import { View, Pressable, Text, StyleSheet, Alert, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography, bento } from './theme';

export interface ToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  onHint: () => void;
  onReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  canHint: boolean;
}

function confirmReset(title: string, message: string, onReset: () => void) {
  if (Platform.OS === 'web') {
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

// Bento pill: 4 種のアクションを 4 色で塗り分け (色で機能を記憶させる)
type PillVariant = 'undo' | 'redo' | 'hint' | 'reset';
const variantStyle: Record<PillVariant, { bg: string; text: string }> = {
  undo: { bg: colors.mint, text: colors.ink },
  redo: { bg: colors.peach, text: colors.ink },
  hint: { bg: colors.secondary, text: colors.textOnDark },
  reset: { bg: colors.primary, text: colors.textOnPrimary },
};

interface PillProps {
  variant: PillVariant;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}
function Pill({ variant, label, disabled, onPress }: PillProps) {
  const v = variantStyle[variant];
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: v.bg },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[typography.buttonSmall, { color: v.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.bar}>
      <Pill variant="undo" label={t('game.undo')} disabled={!props.canUndo} onPress={props.onUndo} />
      <Pill variant="redo" label={t('game.redo')} disabled={!props.canRedo} onPress={props.onRedo} />
      <Pill variant="hint" label={t('game.hintButton')} disabled={!props.canHint} onPress={props.onHint} />
      <Pill
        variant="reset"
        label={t('game.reset')}
        onPress={() => confirmReset(t('game.reset'), t('game.resetConfirm'), props.onReset)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.md,
    ...bento.offsetShadow,
  },
  disabled: { opacity: 0.4 },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
