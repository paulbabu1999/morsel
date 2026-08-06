import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, font, radius, shadow, spacing } from '../theme';
import type { Meal } from '../api';
import { capitalize, formatWhen, round, withCommas } from '../utils/format';
import { MacroRow } from './Macros';
import { SourceBadge } from './ui';

const MEAL_TYPE_ICON: Record<string, string> = {
  breakfast: '🥐',
  lunch: '🥗',
  dinner: '🍽️',
  snack: '🍎',
};

/** Full feed card: thumbnail, description, time/location, macros, badges. */
export function MealCard({ meal, onPress }: { meal: Meal; onPress?: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
      {meal.photo_uri ? (
        <Image source={{ uri: meal.photo_uri }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={styles.thumbEmoji}>{MEAL_TYPE_ICON[meal.meal_type] ?? '🍽️'}</Text>
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.mealType}>{capitalize(meal.meal_type)}</Text>
          <SourceBadge source={meal.source} />
        </View>
        <Text style={styles.desc} numberOfLines={2}>
          {meal.description}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {formatWhen(meal.eaten_at)}
          {meal.location_text ? `  ·  ${meal.location_text}` : ''}
        </Text>
        <View style={styles.macros}>
          <MacroRow
            calories={meal.total_calories}
            protein={meal.total_protein_g}
            carbs={meal.total_carbs_g}
            fat={meal.total_fat_g}
            variant="compact"
          />
          <Text style={styles.microLine} numberOfLines={1}>
            {round(meal.total_carbs_g)}g carbs · {round(meal.total_fat_g)}g fat · {round(meal.total_fiber_g, 1)}g fiber ·{' '}
            {withCommas(meal.total_sodium_mg)}mg sodium
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Compact card used to cite supporting meals in query results. */
export function MealCiteCard({ meal, onPress }: { meal: Meal; onPress?: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.cite}>
      {meal.photo_uri ? (
        <Image source={{ uri: meal.photo_uri }} style={styles.citeThumb} />
      ) : (
        <View style={[styles.citeThumb, styles.thumbFallback]}>
          <Text style={styles.thumbEmoji}>{MEAL_TYPE_ICON[meal.meal_type] ?? '🍽️'}</Text>
        </View>
      )}
      <View style={styles.citeBody}>
        <Text style={styles.citeDesc} numberOfLines={2}>
          {meal.description}
        </Text>
        <Text style={styles.citeMeta} numberOfLines={1}>
          {formatWhen(meal.eaten_at)} · {meal.total_calories} cal
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  thumb: { width: 104, height: '100%', minHeight: 132, backgroundColor: colors.surfaceAlt },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: 34 },
  body: { flex: 1, padding: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  mealType: { fontSize: font.tiny, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
  desc: { fontSize: font.body, fontWeight: '600', color: colors.text, lineHeight: 20 },
  meta: { fontSize: font.small, color: colors.textMuted, marginTop: 4 },
  macros: { marginTop: spacing.sm },
  microLine: { fontSize: font.tiny, color: colors.textFaint, marginTop: 3, fontWeight: '600' },

  cite: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  citeThumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  citeBody: { flex: 1, marginLeft: spacing.md },
  citeDesc: { fontSize: font.small, fontWeight: '600', color: colors.text, lineHeight: 18 },
  citeMeta: { fontSize: font.tiny, color: colors.textMuted, marginTop: 2 },
});
