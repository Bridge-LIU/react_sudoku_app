// figma-sync パイプライン (Phase 4 = Playwright screenshot) 専用の isolated mount route。
//
// === 目的 ===
//   個別 component を「chrome/nav なし」で 1 画面に丸ごとマウントし、Playwright に
//   フル画面キャプチャさせる。/__figma-sync-preview__/Home のような URL でアクセスされる。
//
// === Router ===
//   このアプリは expo-router (file-based routing)。App.tsx は存在せず、_layout.tsx が root。
//   このファイル自体が /__figma-sync-preview__/[component] にマップされる。
//
// === Config vs 実態のギャップ ===
//   scripts/figma-sync/config.json は以下を期待:
//     - src/screens/Home.tsx           ← 実際は src/app/index.tsx
//     - src/screens/Play.tsx           ← 実際は src/app/play/[difficulty].tsx
//     - src/ui/ResetDialog.tsx         ← 実在せず。ConfirmDialog を「リセット確認」用途で使用
//   PREVIEW_MAP は実在ファイルにマップする。config.json 側の追随は別 task。
//
// === Prod 露出について ===
//   __DEV__ ガードは意図的に置いていない。理由:
//     1. Expo Router は静的にファイルを scan するため、条件 export で route を消せない
//     2. パス名が __figma-sync-preview__ で明示的にツール用と分かる
//     3. Playwright は staticwebapp デプロイ済みビルドに対しても走らせる可能性がある
//   本番から完全隠蔽したい場合は staticwebapp.config.json でルーティング拒否する方針。

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

// PREVIEW_MAP: component name → dynamic import factory。
// dynamic import にすることで:
//   (a) 通常のアプリ起動ルート (/, /play/:d) では読み込まれず bundle size に影響しない
//   (b) 1 度に 1 component だけロードして isolation を維持
type LazyModule = () => Promise<Record<string, unknown>>;

const PREVIEW_MAP: Record<string, LazyModule> = {
  // Home: src/app/index.tsx の default export = HomeScreen
  Home: () => import('../index'),
  // Play: 動的 route の default export = PlayScreen
  // NOTE: PlayScreen は URL params を要求するので mount 時に easy を注入する必要あり。
  // 現状の実装は useLocalSearchParams に依存しており params 注入経路がないので、
  // Play preview は「loading spinner のみ」の状態でキャプチャされる可能性が高い。
  // Phase 4 で問題になれば別途 <Play difficulty="easy" /> 相当の wrapper を検討。
  Play: () => import('../play/[difficulty]'),
  // ResetDialog: 実在しないため ConfirmDialog を代替として使用。
  // ConfirmDialog は named export なので、下の render 側で判定する。
  ResetDialog: () => import('@/ui/ConfirmDialog'),
};

export default function FigmaSyncPreview() {
  const params = useLocalSearchParams<{ component?: string }>();
  const componentName = typeof params.component === 'string' ? params.component : undefined;

  const [Loaded, setLoaded] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!componentName) {
      setError('MISSING_COMPONENT_PARAM');
      return;
    }
    const factory = PREVIEW_MAP[componentName];
    if (!factory) {
      setError(`UNKNOWN_COMPONENT: ${componentName}`);
      return;
    }
    let cancelled = false;
    setError(null);
    setLoaded(null);
    void factory()
      .then((mod) => {
        if (cancelled) return;
        // default export を優先、なければ named export のうち component 名と一致するものを試す
        const modAsRecord = mod as Record<string, unknown>;
        const Comp =
          (modAsRecord.default as React.ComponentType<Record<string, unknown>> | undefined) ??
          (modAsRecord[componentName] as React.ComponentType<Record<string, unknown>> | undefined);
        if (!Comp) {
          setError(`NO_MATCHING_EXPORT: ${componentName}`);
          return;
        }
        setLoaded(() => Comp);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(`LOAD_FAILED: ${err instanceof Error ? err.message : String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [componentName]);

  if (error) {
    return (
      <View style={styles.stub} testID="figma-sync-preview-error">
        <Text style={styles.stubText}>Preview error: {error}</Text>
        <Text style={styles.stubHint}>
          Available: {Object.keys(PREVIEW_MAP).join(', ')}
        </Text>
      </View>
    );
  }

  if (!Loaded) {
    return (
      <View style={styles.stub} testID="figma-sync-preview-loading">
        <ActivityIndicator size="large" />
        <Text style={styles.stubText}>Loading {componentName}…</Text>
      </View>
    );
  }

  // ResetDialog (= ConfirmDialog) は Modal ベースで visible prop が必要。
  // Modal は visible=false だと何も描画しないので、Playwright が空画面を撮ってしまう。
  // Preview 用に visible=true + no-op handlers を注入する。
  if (componentName === 'ResetDialog') {
    return (
      <View style={styles.host} testID="figma-sync-preview">
        <Loaded
          visible
          title="Reset"
          message="This will clear your progress."
          onConfirm={() => {}}
          onCancel={() => {}}
          destructive
        />
      </View>
    );
  }

  return (
    <View style={styles.host} testID="figma-sync-preview">
      <Loaded />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  stub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  stubText: { fontSize: 14, color: '#333' },
  stubHint: { fontSize: 12, color: '#888' },
});
