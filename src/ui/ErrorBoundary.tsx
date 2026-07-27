/**
 * React Error Boundary：レンダー中の例外をキャッチしてフォールバック UI を出す。
 *
 * === Vue との対応 ===
 *   Vue 3 の app.config.errorHandler / <ErrorBoundary> ラッパー相当。
 *   ただし React では「クラスコンポーネント」でしか実装できない（hooks では書けない）。
 *   これは React の歴史的経緯：componentDidCatch / getDerivedStateFromError が hook 化されていない。
 *
 * === 捕捉できないもの ===
 *   - イベントハンドラ内のエラー（onPress の中で throw しても捕捉されない）
 *   - 非同期処理（Promise、setTimeout、await）
 *   - サーバーサイドレンダー
 *   これらは _layout.tsx の window.onerror / unhandledrejection で補足する。
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, typography } from './theme';

interface State {
  hasError: boolean;
  message: string;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  // レンダー中の例外を捕捉して state を更新（fallback UI に切り替える）
  // 共有デバイスで悪意ある文字列を UI にそのまま出さないよう長さ制限（fingerprint 防止）
  static getDerivedStateFromError(err: Error): State {
    const raw = err.message || err.name || 'Unknown error';
    return { hasError: true, message: raw.slice(0, 200) };
  }

  // 副作用（ログ送信など）はここで。componentStack はファイルパスを含みうるので name+message のみ残す。
  componentDidCatch(err: Error, _info: ErrorInfo): void {
    console.error('[ErrorBoundary]', { name: err.name, message: err.message });
  }

  private reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    // fallback UI：三言語ハードコード（i18n 自体が壊れている可能性があるので）
    return (
      <View style={styles.container}>
        <Text style={typography.h1}>😵</Text>
        <Text style={typography.h1}>何かがおかしくなりました</Text>
        <Text style={typography.h1}>出错了 / Something went wrong</Text>
        <Text style={styles.detail}>{this.state.message}</Text>
        <Pressable style={styles.button} onPress={this.reset}>
          <Text style={styles.buttonText}>Retry / 再試行 / 重试</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  detail: {
    marginTop: spacing.md,
    color: colors.disabled,
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
