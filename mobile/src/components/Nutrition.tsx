import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import type { AdequacyItem, AdequacyKind, AdequacyStatus } from '../api';
import { round, withCommas } from '../utils/format';

// ---------------------------------------------------------------------------
// ProgressRing — a pure React-Native (no SVG) circular progress "donut".
//
// Technique: draw two colored half-discs (a full pie) and rotate a track-colored
// half-disc "mask" over each half to reveal the arc clockwise from 12 o'clock,
// then punch a surface-colored hole in the middle to leave a ring.
// ---------------------------------------------------------------------------
function HalfDisc({
  side,
  color,
  rotate,
  radius: r,
}: {
  side: 'left' | 'right';
  color: string;
  rotate: number; // degrees, clockwise from 12 o'clock
  radius: number;
}) {
  const roundStyle =
    side === 'right'
      ? { borderTopRightRadius: r, borderBottomRightRadius: r }
      : { borderTopLeftRadius: r, borderBottomLeftRadius: r };
  // Pivot on the disc's flat edge (the ring's vertical centre line).
  const dx = side === 'right' ? -r / 2 : r / 2;
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: r,
          height: r * 2,
          left: 0,
          top: 0,
          backgroundColor: color,
          transform: [{ translateX: dx }, { rotate: `${rotate}deg` }, { translateX: -dx }],
        },
        roundStyle,
      ]}
    />
  );
}

export function ProgressRing({
  progress,
  size = 172,
  stroke = 16,
  color = colors.primary,
  track = colors.surfaceAlt,
  hole = colors.surface,
  children,
}: {
  /** 0..1 (values above 1 render as a full ring; show the real % in `children`). */
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  hole?: string;
  children?: React.ReactNode;
}) {
  const p = Math.min(Math.max(progress, 0), 1);
  const r = size / 2;
  const rightMaskRotate = Math.min(p, 0.5) * 360; // 0..180
  const leftMaskRotate = Math.max(p - 0.5, 0) * 360; // 0..180
  const holeSize = size - stroke * 2;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Right half: colored base + rotating track mask */}
      <View style={[styles.half, { left: r, width: r, height: size }]}>
        <HalfDisc side="right" color={color} rotate={0} radius={r} />
        <HalfDisc side="right" color={track} rotate={rightMaskRotate} radius={r} />
      </View>
      {/* Left half */}
      <View style={[styles.half, { left: 0, width: r, height: size }]}>
        <HalfDisc side="left" color={color} rotate={0} radius={r} />
        <HalfDisc side="left" color={track} rotate={leftMaskRotate} radius={r} />
      </View>
      {/* Hole */}
      <View
        style={{
          width: holeSize,
          height: holeSize,
          borderRadius: holeSize / 2,
          backgroundColor: hole,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CalorieRing — intake vs. daily calorie target.
// ---------------------------------------------------------------------------
export function CalorieRing({
  intake,
  target,
  caption,
}: {
  intake: number;
  target: number;
  caption?: string;
}) {
  const pct = target > 0 ? intake / target : 0;
  const over = target > 0 && intake > target;
  const remaining = Math.round(target - intake);
  const ringColor = over ? colors.danger : colors.primary;
  return (
    <View style={styles.calorieWrap}>
      <ProgressRing progress={pct} color={ringColor}>
        <Text style={[styles.calorieValue, { color: ringColor }]}>{withCommas(intake)}</Text>
        <Text style={styles.calorieUnit}>of {withCommas(target)} kcal</Text>
        <View style={[styles.caloriePill, over && styles.caloriePillOver]}>
          <Text style={[styles.caloriePillText, over && styles.caloriePillTextOver]}>
            {over ? `${withCommas(Math.abs(remaining))} over` : `${withCommas(remaining)} left`}
          </Text>
        </View>
      </ProgressRing>
      {caption ? <Text style={styles.calorieCaption}>{caption}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Adequacy bars — per-day average vs. target/limit, colored by status.
// ---------------------------------------------------------------------------
export function adequacyColor(status: AdequacyStatus, kind: AdequacyKind): string {
  switch (status) {
    case 'ok':
      return colors.success;
    case 'low':
      return colors.carbs; // under a target you want to hit
    case 'over':
      return colors.danger; // exceeded a limit
    case 'high':
      return kind === 'limit' ? colors.carbs : colors.hybrid; // near a limit / well above a target
    default:
      return colors.textFaint; // unknown
  }
}

const STATUS_LABEL: Record<AdequacyStatus, string> = {
  low: 'Low',
  ok: 'On track',
  high: 'High',
  over: 'Over',
  unknown: '—',
};

export function AdequacyBar({ item }: { item: AdequacyItem }) {
  const color = adequacyColor(item.status, item.kind);
  const fillPct = Math.min(Math.max(item.pct, 0), 100);
  return (
    <View style={styles.adqRow}>
      <View style={styles.adqTop}>
        <Text style={styles.adqLabel}>{item.label}</Text>
        <Text style={styles.adqAmount}>
          {round(item.amount, item.amount < 20 ? 1 : 0)}
          <Text style={styles.adqTarget}>
            {' / '}
            {round(item.target, item.target < 20 ? 1 : 0)} {item.unit}
            {item.kind === 'limit' ? ' max' : ''}
          </Text>
        </Text>
      </View>
      <View style={styles.adqTrack}>
        <View style={[styles.adqFill, { width: `${fillPct}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.adqBottom}>
        <View style={[styles.adqDot, { backgroundColor: color }]} />
        <Text style={[styles.adqStatus, { color }]}>{STATUS_LABEL[item.status]}</Text>
        <Text style={styles.adqPct}>{Math.round(item.pct)}%</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// NutrientChips — a compact grid of micronutrient values.
// ---------------------------------------------------------------------------
export interface NutrientChip {
  label: string;
  value: string;
}

export function NutrientChips({ items }: { items: NutrientChip[] }) {
  return (
    <View style={styles.chipGrid}>
      {items.map((n) => (
        <View key={n.label} style={styles.nChip}>
          <Text style={styles.nChipVal}>{n.value}</Text>
          <Text style={styles.nChipLabel}>{n.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  half: { position: 'absolute', top: 0, overflow: 'hidden' },

  calorieWrap: { alignItems: 'center' },
  calorieValue: { fontSize: font.h1, fontWeight: '800', letterSpacing: -0.5 },
  calorieUnit: { fontSize: font.small, color: colors.textMuted, fontWeight: '600', marginTop: 1 },
  caloriePill: {
    marginTop: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  caloriePillOver: { backgroundColor: colors.dangerSoft },
  caloriePillText: { fontSize: font.tiny, fontWeight: '800', color: colors.primaryDark, letterSpacing: 0.3 },
  caloriePillTextOver: { color: colors.danger },
  calorieCaption: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },

  adqRow: { marginBottom: spacing.lg },
  adqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 5 },
  adqLabel: { fontSize: font.small, fontWeight: '700', color: colors.text },
  adqAmount: { fontSize: font.small, fontWeight: '800', color: colors.text },
  adqTarget: { fontSize: font.tiny, fontWeight: '600', color: colors.textFaint },
  adqTrack: { height: 9, backgroundColor: colors.surfaceAlt, borderRadius: 5, overflow: 'hidden' },
  adqFill: { height: '100%', borderRadius: 5 },
  adqBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  adqDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  adqStatus: { fontSize: font.tiny, fontWeight: '700' },
  adqPct: { fontSize: font.tiny, fontWeight: '700', color: colors.textMuted, marginLeft: 'auto' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  nChip: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: '22%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  nChipVal: { fontSize: font.small, fontWeight: '800', color: colors.text },
  nChipLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: 1, fontWeight: '600' },
});
