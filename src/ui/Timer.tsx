// 显示 mm:ss 格式的计时器。纯展示组件，输入毫秒数。
// 逻辑（每秒累加）在 Task 5 的 GameProvider 里用 useEffect + setInterval 实现。

import React from 'react';
import { Text } from 'react-native';
import { typography } from './theme';

export function Timer({ elapsedMs }: { elapsedMs: number }) {
  const s = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <Text style={typography.button}>{mm}:{ss}</Text>;
}
