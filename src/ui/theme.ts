// 主题 token。集中管理颜色、间距、字体，方便未来切换暗色模式或调整品牌色。
// RN 里没有 CSS variables，用 TS 常量代替 —— 好处是自动补全 + 类型安全。

import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#F7F7FA',
  boardBg: '#FFFFFF',
  gridLine: '#CFD3DC',
  gridLineBold: '#5A6070',
  cellInitial: '#F0F2F7',
  cellUser: '#FFFFFF',
  cellSelected: '#B8DBFF',
  cellSameLine: '#E8F1FA',
  cellSameNumber: '#C6E2C6',
  cellConflict: '#FFC7C7',
  textInitial: '#111111',
  textUser: '#1E5CFF',
  textConflict: '#B00020',
  primary: '#1E5CFF',
  danger: '#B00020',
  disabled: '#9AA0AB',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// StyleSheet.create 会把样式对象注册进 RN 的样式表并返回引用 id。
// 好处：每次 render 不重新创建对象、Native 端可以做样式合并优化。
// 对比 Vue：类似把 <style scoped> 里的类提取成常量。
export const typography = StyleSheet.create({
  cellNumber: { fontSize: 22, fontWeight: '600' },
  cellNote: { fontSize: 9 },
  button: { fontSize: 16, fontWeight: '600' },
  h1: { fontSize: 28, fontWeight: '700' },
});
