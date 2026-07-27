// 单个数独格子。纯展示组件（props in, JSX out）——所有状态和逻辑通过 props 传入。
// Bento Grid Modern スタイル: 選択時は mustard yellow bg + 太い黒枠。

import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View, StyleSheet, type View as ViewType } from 'react-native';
import { Digit, NonEmptyDigit } from '@/types/domain';
import { colors, typography } from './theme';

export interface CellProps {
  value: Digit;
  notes: readonly NonEmptyDigit[];
  isInitial: boolean;
  isSelected: boolean;
  isSameLine: boolean;
  isSameNumber: boolean;
  isConflict: boolean;
  onPress: () => void;
}

export function Cell(props: CellProps) {
  // 背景色の優先度: selected > conflict > sameNumber > sameLine > initial/user
  const bg = props.isSelected
    ? colors.cellSelected
    : props.isConflict
    ? colors.cellConflict
    : props.isSameNumber
    ? colors.cellSameNumber
    : props.isSameLine
    ? colors.cellSameLine
    : props.isInitial
    ? colors.cellInitial
    : colors.cellUser;

  // 文字色: 初期セル = 黒、ユーザー入力 = 電気ブルー、冲突は背景色で示すので文字色は黒
  const textColor = props.isInitial ? colors.textInitial : colors.textUser;

  // 選択セルの DOM フォーカス同期 (Tab キー移動時のフォーカスリング一致)
  const ref = useRef<ViewType>(null);
  useEffect(() => {
    if (!props.isSelected) return;
    const node = ref.current as unknown as { focus?: () => void } | null;
    node?.focus?.();
  }, [props.isSelected]);

  return (
    <Pressable
      ref={ref}
      onPress={props.onPress}
      style={[
        styles.cell,
        { backgroundColor: bg },
        props.isSelected && styles.selectedRing,
      ]}
      accessibilityLabel={`cell value ${props.value}`}
    >
      {props.value !== 0 ? (
        <Text style={[typography.cellNumber, { color: textColor }]}>{props.value}</Text>
      ) : (
        <View style={styles.notes}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <Text key={n} style={[typography.cellNote, styles.note]}>
              {props.notes.includes(n as NonEmptyDigit) ? n : ''}
            </Text>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    // 細い grid line (block 内)。3x3 block の thick line は Board 側で描画。
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.gridLine,
  },
  // 選択リング: mustard bg + 3px 黒枠 (雄厚な視認性、Bento の黒統一)
  selectedRing: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },
  notes: { flexDirection: 'row', flexWrap: 'wrap', width: 32, height: 32 },
  note: { width: 10, height: 10, textAlign: 'center', color: colors.disabled },
});
