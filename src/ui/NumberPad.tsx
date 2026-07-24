// 屏幕数字键盘：1-9 数字 + 删除 + 切换 memo 模式。
// 对比 Vue：如果是 Vue 组件，就用 v-for 展开，@click 触发 emit。

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { NonEmptyDigit } from '@/types/domain';
import { colors, spacing, typography } from './theme';
// useTranslation 是 react-i18next 的 hook，返回 { t, i18n }。
// hook 只能在函数组件顶层调用（不能在循环/条件里）。
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
      <View style={styles.row}>
        {numbers.map(n => (
          <Pressable
            key={n}
            style={[styles.numBtn, props.disabled && styles.disabled]}
            onPress={() => props.onNumber(n)}
            disabled={props.disabled}
          >
            <Text style={typography.cellNumber}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Pressable style={styles.actionBtn} onPress={props.onDelete}><Text>⌫</Text></Pressable>
        <Pressable
          style={[styles.actionBtn, props.memoMode && styles.memoActive]}
          onPress={props.onToggleMode}
        >
          {/* t('game.memoMode') 会按当前语言返回对应字符串 */}
          <Text>{t('game.memoMode')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.sm, alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  numBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 4 },
  actionBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: '#fff', borderRadius: 4 },
  memoActive: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
});
