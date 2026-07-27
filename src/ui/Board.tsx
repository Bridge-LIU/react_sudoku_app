// 9x9 数独盘面。用两层 map 渲染 9 行 × 9 格。
// 3x3 大块的边框用条件样式（第 3/6 行下边框加粗，第 3/6 列右边框加粗）。

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Cell } from './Cell';
import { Board as BoardData, Digit, Notes } from '@/types/domain';
import { colors, bento } from './theme';

export interface BoardProps {
  board: BoardData;
  initialBoard: BoardData;
  notes: Notes;
  selectedIndex: number | null;
  highlights: { sameLine: ReadonlySet<number>; sameNumber: ReadonlySet<number> };
  conflicts: ReadonlySet<number>;
  onCellPress: (index: number) => void;
}

export function Board(props: BoardProps) {
  return (
    <View style={styles.board}>
      {/* 外层 map: 9 行。对比 Vue: v-for="r in 9" */}
      {[...Array(9)].map((_, r) => (
        <View key={r} style={[styles.row, (r % 3 === 2 && r !== 8) && styles.boldBottom]}>
          {[...Array(9)].map((_, c) => {
            const idx = r * 9 + c;
            return (
              <View key={c} style={[(c % 3 === 2 && c !== 8) && styles.boldRight]}>
                <Cell
                  value={props.board[idx] as Digit}
                  notes={props.notes[idx] ?? []}
                  isInitial={props.initialBoard[idx] !== 0}
                  isSelected={props.selectedIndex === idx}
                  isSameLine={props.highlights.sameLine.has(idx)}
                  isSameNumber={props.highlights.sameNumber.has(idx)}
                  isConflict={props.conflicts.has(idx)}
                  onPress={() => props.onCellPress(idx)}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Bento: 2px 黒枠 + 12px rounded + offset shadow
  board: {
    borderWidth: bento.borderWidth,
    borderColor: colors.gridLineBold,
    backgroundColor: colors.boardBg,
    borderRadius: bento.radius.lg,
    overflow: 'hidden',
    ...bento.offsetShadow,
  },
  row: { flexDirection: 'row' },
  boldBottom: { borderBottomWidth: 2, borderBottomColor: colors.gridLineBold },
  boldRight: { borderRightWidth: 2, borderRightColor: colors.gridLineBold },
});
