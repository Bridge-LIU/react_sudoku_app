// 单个数独格子。纯展示组件（props in, JSX out）——所有状态和逻辑通过 props 传入。
// 对比 Vue：类似 <script setup> + defineProps 的组件，但 React 没有 SFC，template 直接写在 return 里。

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
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
  // 用三元链决定背景色。优先级 selected > conflict > sameNumber > sameLine > initial/user
  // 这是 React 惯用法：条件写在 render 里，不像 Vue 用 v-bind:class。
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

  return (
    // Pressable 是 RN 的“可点击容器”，同时支持 press/hover/focus 状态。
    // 对比 HTML：不是 <button>，更像 <div onclick> + 触摸反馈。Web端会自动映射成 <div>。
    <Pressable
      onPress={props.onPress}
      disabled={props.isInitial}
      // style 可以是对象或对象数组；数组会依次合并（后面覆盖前面）
      style={[styles.cell, { backgroundColor: bg }]}
      accessibilityLabel={`cell value ${props.value}`}
    >
      {props.value !== 0 ? (
        // Text 是 RN 唯一能显示文字的组件。不能像浏览器那样把文字直接塞进 <div>。
        <Text style={[typography.cellNumber, { color: textColor }]}>{props.value}</Text>
      ) : (
        // 候选 memo：9 个小数字排 3x3。用 flexbox wrap 实现。
        <View style={styles.notes}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            // key 是 React 列表渲染必须的，对比 Vue 的 :key
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
  cell: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.gridLine },
  notes: { flexDirection: 'row', flexWrap: 'wrap', width: 30, height: 30 },
  note: { width: 10, height: 10, textAlign: 'center', color: colors.disabled },
});
