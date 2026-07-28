/**
 * Cell smoke test — 値・選択状態の描画確認 (Bento デザイン)。
 * 目的: jest-expo + @testing-library/react-native の設定が動くことの証明。
 * 詳細な UX 検証は Expo Go / Web で目視 (このプロジェクトは学習用途)。
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Cell } from './Cell';

describe('Cell', () => {
  const defaultProps = {
    value: 0 as const,
    notes: [],
    isInitial: false,
    isSelected: false,
    isSameLine: false,
    isSameNumber: false,
    isConflict: false,
    onPress: () => {},
  };

  it('renders the digit when value is non-zero', () => {
    const { getByText } = render(<Cell {...defaultProps} value={7} />);
    expect(getByText('7')).toBeTruthy();
  });

  it('renders empty cell (no digit text) when value is 0', () => {
    const { queryByText } = render(<Cell {...defaultProps} value={0} />);
    // 空セルには 1-9 の数字が表示されないこと (note 領域は memo 用)
    for (let d = 1; d <= 9; d++) {
      // note で数字が入る可能性はあるが notes=[] なので何も出ないはず
      expect(queryByText(String(d))).toBeNull();
    }
  });

  it('is accessible with the value label', () => {
    const { getByLabelText } = render(<Cell {...defaultProps} value={5} />);
    expect(getByLabelText('cell value 5')).toBeTruthy();
  });

  // === Snapshot ===
  it('snapshot: value=7', () => {
    const tree = render(<Cell {...defaultProps} value={7} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('snapshot: empty selected cell with same-line highlight', () => {
    const tree = render(<Cell {...defaultProps} value={0} isSelected={true} isSameLine={true} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('snapshot: conflict state', () => {
    const tree = render(<Cell {...defaultProps} value={5} isConflict={true} />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
