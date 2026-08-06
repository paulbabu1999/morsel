import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme';
import type { CaptureSource, QueryRoute } from '../api';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Generic Badge
// ---------------------------------------------------------------------------
export function Badge({
  label,
  color,
  bg,
  style,
  textStyle,
}: {
  label: string;
  color: string;
  bg: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.badgeText, { color }, textStyle]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Route badge — the flagship "which retrieval path did the router pick" signal
// ---------------------------------------------------------------------------
const ROUTE_META: Record<QueryRoute, { label: string; color: string; bg: string; blurb: string }> = {
  aggregate: {
    label: 'AGGREGATE',
    color: colors.aggregate,
    bg: colors.aggregateSoft,
    blurb: 'text-to-SQL over your logged meals',
  },
  semantic: {
    label: 'SEMANTIC',
    color: colors.semantic,
    bg: colors.semanticSoft,
    blurb: 'vector search over meal descriptions',
  },
  hybrid: {
    label: 'HYBRID',
    color: colors.hybrid,
    bg: colors.hybridSoft,
    blurb: 'SQL + vector search combined',
  },
};

export function routeMeta(route: QueryRoute) {
  return ROUTE_META[route];
}

export function RouteBadge({ route, large }: { route: QueryRoute; large?: boolean }) {
  const meta = ROUTE_META[route];
  return (
    <View
      style={[
        styles.routeBadge,
        { backgroundColor: meta.bg, borderColor: meta.color },
        large && styles.routeBadgeLarge,
      ]}
    >
      <View style={[styles.routeDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.routeBadgeText, { color: meta.color }, large && { fontSize: font.small }]}>
        {meta.label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Source badge — phone / glasses / manual
// ---------------------------------------------------------------------------
const SOURCE_META: Record<CaptureSource, { label: string; icon: string; color: string; bg: string }> = {
  phone: { label: 'Phone', icon: '📷', color: colors.phone, bg: colors.phoneSoft },
  glasses: { label: 'Glasses', icon: '🕶️', color: colors.glasses, bg: colors.glassesSoft },
  manual: { label: 'Manual', icon: '✍️', color: colors.manual, bg: colors.manualSoft },
};

export function SourceBadge({ source }: { source: CaptureSource }) {
  const meta = SOURCE_META[source];
  return (
    <View style={[styles.sourceBadge, { backgroundColor: meta.bg }]}>
      <Text style={styles.sourceIcon}>{meta.icon}</Text>
      <Text style={[styles.sourceText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip / Pill (tappable)
// ---------------------------------------------------------------------------
export function Chip({
  label,
  onPress,
  selected,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Tag pill (static)
// ---------------------------------------------------------------------------
export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Primary button
// ---------------------------------------------------------------------------
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        isSecondary ? styles.buttonSecondary : styles.buttonPrimary,
        (disabled || loading) && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.primary : colors.onPrimary} />
      ) : (
        <Text style={[styles.buttonText, isSecondary && styles.buttonTextSecondary]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Section title
// ---------------------------------------------------------------------------
export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: font.tiny, fontWeight: '700', letterSpacing: 0.3 },
  routeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  routeBadgeLarge: { paddingHorizontal: spacing.lg, paddingVertical: 7 },
  routeDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  routeBadgeText: { fontSize: font.tiny, fontWeight: '800', letterSpacing: 0.6 },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  sourceIcon: { fontSize: 11, marginRight: 3 },
  sourceText: { fontSize: font.tiny, fontWeight: '700' },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.5 },
  chipText: { color: colors.text, fontSize: font.small, fontWeight: '600' },
  chipTextSelected: { color: colors.onPrimary },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: '600' },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onPrimary, fontSize: font.body, fontWeight: '700' },
  buttonTextSecondary: { color: colors.primary },
  sectionTitle: {
    fontSize: font.h3,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
});
