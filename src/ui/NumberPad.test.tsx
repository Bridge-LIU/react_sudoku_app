/**
 * NumberPad smoke test — 1〜9 表示、押下時のコールバック、disabled 挙動。
 * i18n は fallback（キー文字列）で表示される想定。
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NumberPad } from './NumberPad';

const defaultProps = {
  memoMode: false,
  onNumber: () => {},
  onDelete: () => {},
  onToggleMode: () => {},
  disabled: false,
};

describe('NumberPad', () => {
  it('renders digits 1-9', () => {
    const { getByText } = render(<NumberPad {...defaultProps} />);
    for (let d = 1; d <= 9; d++) {
      expect(getByText(String(d))).toBeTruthy();
    }
  });

  it('calls onNumber with the tapped digit', () => {
    const onNumber = jest.fn();
    const { getByText } = render(<NumberPad {...defaultProps} onNumber={onNumber} />);
    fireEvent.press(getByText('5'));
    expect(onNumber).toHaveBeenCalledWith(5);
  });

  it('does not invoke onNumber when disabled', () => {
    const onNumber = jest.fn();
    const { getByText } = render(<NumberPad {...defaultProps} onNumber={onNumber} disabled={true} />);
    fireEvent.press(getByText('3'));
    expect(onNumber).not.toHaveBeenCalled();
  });

  // === Snapshot ===
  it('snapshot: default state (memo off, enabled)', () => {
    const tree = render(<NumberPad {...defaultProps} />).toJSON();
    expect(tree).toMatchSnapshot();
  });

  it('snapshot: memo mode active', () => {
    const tree = render(<NumberPad {...defaultProps} memoMode={true} />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
