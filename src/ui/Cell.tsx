// 单个数独格子。纯展示组件（props in, JSX out）——所有状态和逻辑通过 props 传入。
// 对比 Vue：类似 <script setup> + defineProps 的组件，但 React 没有 SFC，template 直接写在 return 里。

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

// 函数组件 = 一个接收 props 返回 JSX 的函数。每次父组件 re-render 都会调用。
// 对比 Vue：等价于 <script setup> 里定义的组件，但没有 setup 阶段 vs render 阶段的区分。
export function Cell(props: CellProps) {
  // 用三元链决定背景色。優先度 selected > conflict > sameNumber > sameLine > initial/user
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

  const textColor = props.isConflict
    ? colors.textConflict
    : props.isInitial
    ? colors.textInitial
    : colors.textUser;

  // 選択された時に DOM フォーカスも同期移動 (Tab 押下でブラウザデフォルトのフォーカスリングが
  // 前のセルに残らないよう、選択セル自身を focus する)。
  // ref を Pressable に渡して、Web では underlying HTMLElement の focus() を呼ぶ。
  // Native では focus() が存在しない (or noop) なので optional chaining で安全に呼ぶ。
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
      // 初期セルはタップで選択できるようにするため disabled にしない（値を書き換えないのは reducer が担保）
      // これにより Tab で初期セルもフォーカス移動先になり、ハイライトが自然に流れる。
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
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: colors.gridLine,
  },
  // 選択リング：太い枠を primary 色で。Cell 自体のサイズは変えない (borderWidth 差分は内側に描画される)。
  selectedRing: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  notes: { flexDirection: 'row', flexWrap: 'wrap', width: 30, height: 30 },
  note: { width: 10, height: 10, textAlign: 'center', color: colors.disabled },
});
