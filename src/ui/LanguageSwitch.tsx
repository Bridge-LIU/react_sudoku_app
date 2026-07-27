// 言語切替のコンパクト segmented pill [JA][ZH][EN]。
// Bento: chunky 2px 黒枠、選択中は electric blue 塗り、他は白。
// Home 画面右上に配置する用途 (Play 画面には不要 — ユーザーは既に言語決定済み)。

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import i18n from '@/i18n';
import { useGameState, useGameDispatch } from '@/state/gameContext';
import { colors, spacing, bento, typography } from './theme';

type Lang = 'ja' | 'zh' | 'en';
const LANGS = ['ja', 'zh', 'en'] as const satisfies readonly Lang[];

export function LanguageSwitch() {
  const state = useGameState();
  const dispatch = useGameDispatch();
  const current = state.settings.language;

  const setLang = (lng: Lang) => {
    if (lng === current) return;
    void i18n.changeLanguage(lng);
    dispatch({ type: 'CHANGE_LANGUAGE', payload: { language: lng } });
  };

  return (
    <View style={styles.container}>
      {LANGS.map((l) => {
        const active = l === current;
        return (
          <Pressable
            key={l}
            onPress={() => setLang(l)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.active,
              pressed && !active && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`switch language to ${l}`}
          >
            <Text style={[typography.buttonSmall, { color: active ? colors.textOnDark : colors.ink }]}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.sm,
    ...bento.offsetShadow,
  },
  active: { backgroundColor: colors.secondary },
  pressed: {
    transform: [{ translateX: 2 }, { translateY: 2 }],
    shadowOpacity: 0,
    elevation: 0,
  },
});
