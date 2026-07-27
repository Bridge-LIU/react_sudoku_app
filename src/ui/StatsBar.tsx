// ゲーム進行状況の pill 表示 (難度 / Timer / Mistakes / Hints)。
// Bento: 難度 = electric blue で目立たせる、他 3 つは mint/peach/coral。全ラベル i18n key。

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Difficulty } from '@/types/domain';
import { colors, spacing, typography, bento } from './theme';

export interface StatsBarProps {
  difficulty: Difficulty | null;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

interface StatPillProps {
  bg: string;
  textColor: string;
  label: string;
  value: string;
}
function StatPill({ bg, textColor, label, value }: StatPillProps) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[typography.statLabel, { color: textColor }]}>{label}</Text>
      <Text style={[typography.statValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

export function StatsBar(props: StatsBarProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {props.difficulty && (
        <StatPill
          bg={colors.secondary}
          textColor={colors.textOnDark}
          label={t('difficulty.label')}
          value={t(`difficulty.${props.difficulty}`)}
        />
      )}
      <StatPill bg={colors.mint} textColor={colors.ink} label={t('game.timer')} value={formatTime(props.elapsedMs)} />
      <StatPill bg={colors.peach} textColor={colors.ink} label={t('game.mistakes')} value={String(props.mistakes)} />
      <StatPill bg={colors.coral} textColor={colors.ink} label={t('game.hints')} value={String(props.hintsUsed)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: bento.borderWidth,
    borderColor: colors.ink,
    borderRadius: bento.radius.md,
    alignItems: 'center',
    minWidth: 68,
  },
});
