// 主题 token。集中管理颜色、间距、字体，方便未来切换暗色模式或调整品牌色。
// RN 里没有 CSS variables，用 TS 常量代替 —— 好处是自动补全 + 类型安全。
//
// === 設計指針: Bento Grid Modern ===
//   - クリーム bg + 白 board、太い 2px 黒枠、10-22px 大きめ丸角
//   - Chunky offset shadow (2px 2px 0 黒) で「押せる」立体感
//   - Stat pills は 3 原色 (mint / peach / coral) + 太枠
//   - Selection = mustard yellow、User 入力 = 電気ブルー
//   - 太字タイポ (fontWeight 700-900)、Inter fallback → system

import { StyleSheet } from 'react-native';

export const colors = {
  // ベース
  bg: '#FFFBF0',              // クリーム (warm off-white)
  boardBg: '#FFFFFF',
  ink: '#141414',             // 全ての枠と初期セル文字
  gridLine: '#CCCCCC',        // セル間の細線 (block 内)
  gridLineBold: '#141414',    // 3x3 block と board 外周
  // 選択・状態
  cellInitial: '#FFFFFF',
  cellUser: '#FFFFFF',
  cellSelected: '#FFE066',    // mustard yellow
  cellSameLine: '#FFF7CC',    // 淡黄 (同行/同列/同 block ハイライト)
  cellSameNumber: '#A7F0BA',  // mint (同数字ハイライト)
  cellConflict: '#FFADAD',    // coral
  // テキスト
  textInitial: '#141414',
  textUser: '#3D5AFE',        // 電気ブルー (user 入力)
  textConflict: '#141414',    // 冲突時も黒 (背景色で区別)
  disabled: '#9AA0AB',
  // アクセント / bento pill 色
  primary: '#FF5C8A',         // hot pink
  secondary: '#3D5AFE',       // 電気ブルー
  mint: '#A7F0BA',
  peach: '#FFD6A5',
  coral: '#FFADAD',
  // ボタン内文字
  textOnPrimary: '#FFFFFF',
  textOnDark: '#FFFFFF',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

// Bento の共通パーツ寸法・エフェクト
export const bento = {
  borderWidth: 2,
  radius: { sm: 8, md: 10, lg: 14, xl: 22 } as const,
  // Chunky offset shadow: RN では shadowOffset + elevation で近似
  // (Web は boxShadow, iOS は shadow*, Android は elevation)
  offsetShadow: {
    shadowColor: '#141414',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
} as const;

// StyleSheet.create でスタイル定数を登録
export const typography = StyleSheet.create({
  // 数字セル大きめ + 極太
  cellNumber: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 },
  cellNote: { fontSize: 9, fontWeight: '600' as const },
  button: { fontSize: 15, fontWeight: '800' as const, letterSpacing: -0.2 },
  buttonSmall: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 0 },
  h1: { fontSize: 30, fontWeight: '900' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '900' as const, letterSpacing: -0.3 },
  statValue: { fontSize: 13, fontWeight: '800' as const },
  statLabel: { fontSize: 10, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
});
