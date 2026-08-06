import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { colors, font, radius, spacing } from '../theme';
import { Card, SectionTitle, SourceBadge, Tag } from '../components/ui';
import { MacroRow } from '../components/Macros';
import { NutrientChips } from '../components/Nutrition';
import { Loading, ErrorView } from '../components/StateViews';
import { getMeal, type Meal } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';
import { capitalize, formatWhen, round, withCommas } from '../utils/format';

export function MealDetailScreen({ route }: { route: RouteProp<RootStackParamList, 'MealDetail'> }) {
  const { mealId } = route.params;
  const { data, loading, error, reload } = useAsync<Meal>(() => getMeal(mealId), [mealId]);

  if (loading) return <View style={styles.fill}><Loading label="Loading meal…" /></View>;
  if (error || !data) return <View style={styles.fill}><ErrorView error={error} onRetry={reload} /></View>;

  const meal = data;
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
      {meal.photo_uri ? (
        <Image source={{ uri: meal.photo_uri }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={[styles.photo, styles.photoFallback]}>
          <Text style={styles.photoEmoji}>🍽️</Text>
        </View>
      )}

      <View style={styles.headRow}>
        <Text style={styles.mealType}>{capitalize(meal.meal_type)}</Text>
        <SourceBadge source={meal.source} />
      </View>
      <Text style={styles.desc}>{meal.description}</Text>
      <Text style={styles.meta}>
        {formatWhen(meal.eaten_at)}
        {meal.location_text ? `  ·  ${meal.location_text}` : ''}
      </Text>

      <View style={styles.macrosBlock}>
        <MacroRow
          calories={meal.total_calories}
          protein={meal.total_protein_g}
          carbs={meal.total_carbs_g}
          fat={meal.total_fat_g}
          variant="full"
        />
      </View>

      <SectionTitle style={styles.section}>Micronutrients</SectionTitle>
      <Card>
        <NutrientChips
          items={[
            { label: 'Fiber', value: `${round(meal.total_fiber_g, 1)}g` },
            { label: 'Sugar', value: `${round(meal.total_sugar_g, 1)}g` },
            { label: 'Sodium', value: `${withCommas(meal.total_sodium_mg)}mg` },
            { label: 'Sat fat', value: `${round(meal.total_satfat_g, 1)}g` },
            { label: 'Iron', value: `${round(meal.total_iron_mg, 1)}mg` },
            { label: 'Calcium', value: `${withCommas(meal.total_calcium_mg)}mg` },
            { label: 'Potassium', value: `${withCommas(meal.total_potassium_mg)}mg` },
          ]}
        />
      </Card>

      <SectionTitle style={styles.section}>Items ({meal.items.length})</SectionTitle>
      {meal.items.map((it) => (
        <Card key={it.id} style={styles.itemCard}>
          <View style={styles.itemHead}>
            <Text style={styles.itemName}>{it.canonical_name}</Text>
            <Text style={styles.itemCal}>{it.calories} cal</Text>
          </View>
          <Text style={styles.itemRaw}>
            “{it.raw_name}” · {round(it.quantity, 2)} {it.unit ?? ''}
            {it.grams != null ? ` · ${round(it.grams)}g` : ''}
          </Text>
          <View style={styles.itemMacros}>
            <ItemMacro label="Protein" value={`${round(it.protein_g, 1)}g`} color={colors.protein} />
            <ItemMacro label="Carbs" value={`${round(it.carbs_g, 1)}g`} color={colors.carbs} />
            <ItemMacro label="Fat" value={`${round(it.fat_g, 1)}g`} color={colors.fat} />
          </View>
          <View style={styles.itemMicros}>
            <NutrientChips
              items={[
                { label: 'Fiber', value: `${round(it.fiber_g, 1)}g` },
                { label: 'Sugar', value: `${round(it.sugar_g, 1)}g` },
                { label: 'Sodium', value: `${withCommas(it.sodium_mg)}mg` },
              ]}
            />
          </View>
          {it.resolution_method ? (
            <Text style={styles.itemResolution}>Resolved via {it.resolution_method}</Text>
          ) : null}
        </Card>
      ))}

      {meal.note_text ? (
        <>
          <SectionTitle style={styles.section}>Note</SectionTitle>
          <Card>
            <Text style={styles.noteText}>“{meal.note_text}”</Text>
          </Card>
        </>
      ) : null}

      {meal.tags.length ? (
        <>
          <SectionTitle style={styles.section}>Tags</SectionTitle>
          <View style={styles.tagRow}>
            {meal.tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.confidence}>
        <Text style={styles.confidenceText}>
          Extraction confidence {Math.round(meal.confidence * 100)}%
        </Text>
      </View>
    </ScrollView>
  );
}

function ItemMacro({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.itemMacro}>
      <Text style={[styles.itemMacroVal, { color }]}>{value}</Text>
      <Text style={styles.itemMacroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  photo: { width: '100%', height: 220, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, marginBottom: spacing.lg },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  photoEmoji: { fontSize: 54 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  mealType: { fontSize: font.tiny, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
  desc: { fontSize: font.h3, fontWeight: '800', color: colors.text, lineHeight: 25 },
  meta: { fontSize: font.small, color: colors.textMuted, marginTop: 4 },
  macrosBlock: { marginTop: spacing.lg },
  section: { marginTop: spacing.xl },
  itemCard: { marginBottom: spacing.md, padding: spacing.md },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: font.body, fontWeight: '700', color: colors.text, flex: 1, paddingRight: spacing.sm },
  itemCal: { fontSize: font.small, fontWeight: '800', color: colors.calories },
  itemRaw: { fontSize: font.tiny, color: colors.textFaint, marginTop: 2, fontStyle: 'italic' },
  itemMacros: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.xl },
  itemMacro: {},
  itemMacroVal: { fontSize: font.body, fontWeight: '700' },
  itemMacroLabel: { fontSize: font.tiny, color: colors.textMuted },
  itemMicros: { marginTop: spacing.md },
  itemResolution: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing.sm, fontStyle: 'italic' },
  noteText: { fontSize: font.body, color: colors.text, fontStyle: 'italic', lineHeight: 21 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  confidence: { marginTop: spacing.xl, alignItems: 'center' },
  confidenceText: { fontSize: font.tiny, color: colors.textFaint },
});
