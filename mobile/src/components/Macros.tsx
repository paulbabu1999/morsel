import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';
import { round, withCommas } from '../utils/format';

interface MacroRowProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** compact = single line summary (feed cards); full = labeled columns (detail) */
  variant?: 'compact' | 'full';
}

/** Displays calories + P/C/F. */
export function MacroRow({ calories, protein, carbs, fat, variant = 'compact' }: MacroRowProps) {
  if (variant === 'compact') {
    return (
      <View style={styles.compact}>
        <Text style={[styles.compactVal, { color: colors.calories }]}>{withCommas(calories)} cal</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.compactMuted}>{round(protein)}g protein</Text>
      </View>
    );
  }
  return (
    <View style={styles.full}>
      <Cell label="Calories" value={withCommas(calories)} color={colors.calories} />
      <Cell label="Protein" value={`${round(protein, 1)}g`} color={colors.protein} />
      <Cell label="Carbs" value={`${round(carbs, 1)}g`} color={colors.carbs} />
      <Cell label="Fat" value={`${round(fat, 1)}g`} color={colors.fat} />
    </View>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellVal, { color }]}>{value}</Text>
      <Text style={styles.cellLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { flexDirection: 'row', alignItems: 'center' },
  compactVal: { fontSize: font.small, fontWeight: '700' },
  compactMuted: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  dot: { color: colors.textFaint, marginHorizontal: 6 },
  full: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cell: { flex: 1, alignItems: 'center' },
  cellVal: { fontSize: font.h3, fontWeight: '800' },
  cellLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
});
