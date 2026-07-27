/**
 * 設定シート：言語切替 + トグル系設定。
 *
 * === Vue との対応 ===
 *   Vue の <SettingsPanel /> をどこかで <Modal> に入れて使うのと同じ発想。
 *   単独のプレゼンテーショナルコンポーネントで、ナビゲーション統合は上位に任せる。
 *
 * === i18n 切替の 2 レイヤー ===
 *   1. i18n.changeLanguage(lng)   → 即座に翻訳が切り替わる（副作用、react-i18next 内部で購読）
 *   2. dispatch CHANGE_LANGUAGE   → GameState.settings.language を更新して永続化
 *   両方を同時に呼ぶのは「UI 即時反映」と「永続化」を両立させるため。
 */

import React from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useGameState, useGameDispatch } from '@/state/gameContext';
import { colors, spacing, typography } from './theme';

type Lang = 'ja' | 'zh' | 'en';
// `as const` だけで readonly tuple 型が付くので型注釈は不要。
const LANGS = ['ja', 'zh', 'en'] as const satisfies readonly Lang[];

export function SettingsSheet() {
  const { t } = useTranslation();
  const state = useGameState();
  const dispatch = useGameDispatch();

  const setLang = (lng: Lang) => {
    // 副作用：i18next のグローバル状態を書き換える
    void i18n.changeLanguage(lng);
    // 純粋な state 更新：settings に反映して永続化される
    dispatch({ type: 'CHANGE_LANGUAGE', payload: { language: lng } });
  };

  return (
    <View style={styles.container}>
      <Text style={typography.h1}>{t('settings.title')}</Text>

      {/* 言語ボタン群 */}
      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.language')}</Text>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            onPress={() => setLang(l)}
            style={[styles.langBtn, state.settings.language === l && styles.langBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={`language ${l}`}
          >
            <Text style={state.settings.language === l ? styles.langTextActive : styles.langText}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ミス即時表示トグル */}
      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.showMistakes')}</Text>
        <Switch
          value={state.settings.showMistakesImmediately}
          onValueChange={() =>
            dispatch({ type: 'TOGGLE_SETTING', payload: { key: 'showMistakesImmediately' } })
          }
        />
      </View>

      {/* 自動メモ削除トグル */}
      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.autoRemoveNotes')}</Text>
        <Switch
          value={state.settings.autoRemoveNotes}
          onValueChange={() =>
            dispatch({ type: 'TOGGLE_SETTING', payload: { key: 'autoRemoveNotes' } })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.boardBg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  label: { flex: 1, minWidth: 140 },
  langBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 4,
    backgroundColor: '#eee',
  },
  langBtnActive: { backgroundColor: colors.primary },
  langText: { color: colors.textInitial },
  langTextActive: { color: '#fff', fontWeight: '600' },
});
