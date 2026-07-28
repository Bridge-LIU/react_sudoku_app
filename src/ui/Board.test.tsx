/**
 * Board smoke test — 9x9 描画が壊れてないか。
 * onCellPress のイベント伝搬まで確認。
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Board } from './Board';
import { Board as BoardData } from '@/types/domain';

const emptyBoard: BoardData = new Array(81).fill(0) as BoardData;

const defaultProps = {
  board: emptyBoard,
  initialBoard: emptyBoard,
  notes: {},
  selectedIndex: null,
  highlights: { sameLine: new Set<number>(), sameNumber: new Set<number>() },
  conflicts: new Set<number>(),
  onCellPress: () => {},
};

describe('Board', () => {
  it('renders 81 cells (9x9)', () => {
    const board = [...emptyBoard];
    for (let i = 0; i < 81; i++) board[i] = ((i % 9) + 1) as any;
    const { getAllByLabelText } = render(<Board {...defaultProps} board={board as BoardData} />);
    // aria-label="cell value N" のセルが 81 個
    const cells: any[] = [];
    for (let d = 1; d <= 9; d++) {
      cells.push(...getAllByLabelText(`cell value ${d}`));
    }
    expect(cells.length).toBe(81);
  });

  it('renders empty cells for a blank board', () => {
    const { queryAllByLabelText } = render(<Board {...defaultProps} />);
    // 空セルは aria-label="cell value 0"（Cell 実装に依存、無ければ 0）
    for (let d = 1; d <= 9; d++) {
      expect(queryAllByLabelText(`cell value ${d}`).length).toBe(0);
    }
  });

  it('invokes onCellPress with the index of the tapped cell', () => {
    const onCellPress = jest.fn();
    const board = [...emptyBoard]; board[0] = 5 as any;
    const { getByLabelText } = render(
      <Board {...defaultProps} board={board as BoardData} onCellPress={onCellPress} />
    );
    fireEvent.press(getByLabelText('cell value 5'));
    expect(onCellPress).toHaveBeenCalledWith(0);
  });

  // === Snapshot ===
  it('snapshot: empty 9x9 grid', () => {
    const tree = render(<Board {...defaultProps} />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
