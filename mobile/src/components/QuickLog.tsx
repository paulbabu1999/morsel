import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { Button, Card } from './ui';
import { ApiError, createMealsBatch, quickLog, type CaptureDraft, type MealCreate } from '../api';
import { capitalize } from '../utils/format';

/** Natural-language multi-meal logging: type a whole day, the backend parses it
 *  into drafts, you review the list and save them all at once. */
export function QuickLog({ onSaved }: { onSaved?: () => void }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<CaptureDraft[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const d = await quickLog(text.trim());
      if (!d.length) setError('Could not find any meals in that — try naming a few foods.');
      else setDrafts(d);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not parse that. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function saveAll() {
    if (!drafts || saving) return;
    setSaving(true);
    setError(null);
    try {
      const bodies: MealCreate[] = drafts.map((d) => ({
        meal_type: d.meal_type,
        items: d.items.map((it) => ({
          name: it.canonical_name,
          quantity: it.quantity,
          unit: it.unit,
          grams: it.grams,
        })),
        source: 'phone',
        location: d.location,
        note: d.note,
        description: d.description,
      }));
      const saved = await createMealsBatch(bodies);
      setSavedCount(saved.length);
      setDrafts(null);
      setText('');
      onSaved?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSavedCount(null);
    setDrafts(null);
    setText('');
    setError(null);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>⚡ Quick log</Text>

      {savedCount != null ? (
        <View>
          <Text style={styles.doneText}>
            Logged {savedCount} meal{savedCount === 1 ? '' : 's'} ✓  Find them in History.
          </Text>
          <Button title="Log more" variant="secondary" onPress={reset} style={styles.btn} />
        </View>
      ) : drafts ? (
        <View>
          <Text style={styles.hint}>
            {drafts.length} meal{drafts.length === 1 ? '' : 's'} found — review, then save them all.
          </Text>
          {drafts.map((d, i) => (
            <View key={i} style={[styles.draftRow, i === drafts.length - 1 && styles.draftRowLast]}>
              <Text style={styles.draftType}>{capitalize(d.meal_type)}</Text>
              <Text style={styles.draftItems} numberOfLines={2}>
                {d.items.map((it) => it.canonical_name).join(', ')}
              </Text>
              <Text style={styles.draftCal}>{d.total_calories} kcal</Text>
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={saving ? 'Saving…' : `Save all ${drafts.length}`} onPress={saveAll} loading={saving} style={styles.btn} />
          <Button title="Discard" variant="secondary" onPress={reset} style={styles.btnSmall} />
        </View>
      ) : (
        <View>
          <Text style={styles.hint}>
            Type a whole day at once: “oatmeal + coffee, a chicken bowl for lunch, an apple”.
          </Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="What did you eat?"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={loading ? 'Reading…' : 'Quick log'} onPress={parse} loading={loading} disabled={!text.trim()} style={styles.btn} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xl },
  title: { fontSize: font.h3, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  hint: { fontSize: font.small, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  error: { fontSize: font.small, color: colors.danger, marginTop: spacing.md, fontWeight: '600' },
  btn: { marginTop: spacing.lg },
  btnSmall: { marginTop: spacing.sm },
  doneText: { fontSize: font.body, fontWeight: '700', color: colors.success, lineHeight: 21 },
  draftRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  draftRowLast: { borderBottomWidth: 0 },
  draftType: { fontSize: font.tiny, fontWeight: '800', color: colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  draftItems: { fontSize: font.body, fontWeight: '600', color: colors.text, marginTop: 3, lineHeight: 20 },
  draftCal: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: 3 },
});
