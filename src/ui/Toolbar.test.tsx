/**
 * Toolbar smoke test — Undo/Redo/Hint/Reset の 4 pill の render とコールバック。
 * react-i18next は key をそのまま返す mock で置換（i18n init 不要）
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Toolbar } from './Toolbar';

// i18n mock: t(key) は key をそのまま返す
// jest.mock は babel-plugin-jest-hoist により自動でファイル先頭に巻き上げられるため
// 物理的な記述位置が import 後でも実行時は import より先に評価される。
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => Promise.resolve() } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const defaultProps = {
  onUndo: () => {},
  onRedo: () => {},
  onHint: () => {},
  onReset: () => {},
  canUndo: true,
  canRedo: true,
  canHint: true,
};

describe('Toolbar', () => {
  it('renders 4 action labels (Undo/Redo/Hint/Reset)', () => {
    const { getByText } = render(<Toolbar {...defaultProps} />);
    expect(getByText('game.undo')).toBeTruthy();
    expect(getByText('game.redo')).toBeTruthy();
    expect(getByText('game.hintButton')).toBeTruthy();
    expect(getByText('game.reset')).toBeTruthy();
  });

  it('calls onUndo when the Undo pill is pressed', () => {
    const onUndo = jest.fn();
    const { getByText } = render(<Toolbar {...defaultProps} onUndo={onUndo} />);
    fireEvent.press(getByText('game.undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('does not call onRedo when canRedo=false (disabled prevents callback)', () => {
    const onRedo = jest.fn();
    const { getByText } = render(<Toolbar {...defaultProps} onRedo={onRedo} canRedo={false} />);
    fireEvent.press(getByText('game.redo'));
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('Reset opens ConfirmDialog and only calls onReset after OK', () => {
    const onReset = jest.fn();
    const { getByText, queryByText } = render(<Toolbar {...defaultProps} onReset={onReset} />);
    // Reset を押しただけでは onReset は呼ばれない (確認ダイアログが出るだけ)
    fireEvent.press(getByText('game.reset'));
    expect(onReset).not.toHaveBeenCalled();
    expect(queryByText('game.resetConfirm')).toBeTruthy();
    // OK を押して初めて onReset が呼ばれる
    fireEvent.press(getByText('common.ok'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('Reset → Cancel does not call onReset and hides dialog', () => {
    const onReset = jest.fn();
    const { getByText, queryByText } = render(<Toolbar {...defaultProps} onReset={onReset} />);
    fireEvent.press(getByText('game.reset'));
    fireEvent.press(getByText('common.cancel'));
    expect(onReset).not.toHaveBeenCalled();
    expect(queryByText('game.resetConfirm')).toBeNull();
  });
});
