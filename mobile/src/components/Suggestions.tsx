import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { createMeal, getSuggestions, type Meal } from '../api';
import { useAsync } from '../hooks/useAsync';
import { capitalize } from '../utils/format';

/** "Log again" — one-tap re-logging of recent meals, biased to the time of day.
 *  Tapping a chip persists a fresh copy and hands it to the parent's saved view. */
export function Suggestions({ onLogged }: { onLogged: (meal: Meal) => void }) {
  const { data, loading } = useAsync<Meal[]>(() => getSuggestions(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const meals = data ?? [];
  if (loading || meals.length === 0) return null;

  async function again(m: Meal) {
    if (busy) return;
    setBusy(m.id);
    try {
      const saved = await createMeal({
        meal_type: m.meal_type,
        items: m.items.map((it) => ({
          name: it.canonical_name,
          quantity: it.quantity,
          unit: it.unit,
          grams: it.grams,
        })),
        source: 'phone',
        location: m.location_text,
        description: m.description,
      });
      onLogged(saved);
    } catch {
      // a failed re-log leaves the form untouched; the user can tap again
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Log again</Text>
      <Text style={styles.hint}>One tap to re-log a recent meal — picks for this time of day.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {meals.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={styles.chip}
            activeOpacity={0.85}
            disabled={busy === m.id}
            onPress={() => again(m)}
          >
            {busy === m.id ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.chipSpinner} />
            ) : (
              <>
                <Text style={styles.chipType}>{capitalize(m.meal_type)}</Text>
                <Text style={styles.chipName} numberOfLines={2}>
                  {shortDesc(m)}
                </Text>
                <Text style={styles.chipCal}>{m.total_calories} kcal</Text>
              </>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function shortDesc(m: Meal): string {
  const names = m.items.map((i) => i.canonical_name).slice(0, 2).join(', ');
  return names || m.description;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  title: { fontSize: font.h3, fontWeight: '700', color: colors.text },
  hint: { fontSize: font.small, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md, lineHeight: 18 },
  row: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    width: 150,
    minHeight: 92,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  chipSpinner: { alignSelf: 'center', marginVertical: spacing.lg },
  chipType: { fontSize: font.tiny, fontWeight: '800', color: colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  chipName: { fontSize: font.small, fontWeight: '600', color: colors.text, marginTop: 4, lineHeight: 18 },
  chipCal: { fontSize: font.tiny, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm },
});
