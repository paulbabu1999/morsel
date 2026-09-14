import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { ApiError, getWeights, logWeight, type WeightEntry } from '../api';
import { useAsync } from '../hooks/useAsync';
import { Button, Card } from './ui';
import { round } from '../utils/format';

/** Exponential moving average — the smoothed line that ignores daily water-weight
 *  noise (the thing that discourages people and drives quitting). */
function ema(values: number[], alpha = 0.25): number[] {
  const out: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = out.length === 0 ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Weight progress: a smoothed trend, never the raw daily verdict. Losing shows a
 *  gentle green; up is neutral (a single weigh-in is noise, not failure). */
export function WeightCard() {
  const { data, loading, reload } = useAsync<WeightEntry[]>(() => getWeights(), []);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function logIt() {
    const kg = Number(value);
    if (!kg || kg < 20 || kg > 400 || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await logWeight(kg);
      setValue('');
      reload();
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const weights = data ?? [];
  const trend = weights.length ? ema(weights.map((w) => w.weight_kg)) : [];
  const smoothedNow = trend.length ? trend[trend.length - 1] : null;
  // Change is measured on the SMOOTHED line, so a random heavy day never reads as
  // "you gained".
  const change = trend.length >= 2 ? trend[trend.length - 1] - trend[0] : 0;
  const losing = change < -0.1;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>Weight trend</Text>
        {smoothedNow != null ? (
          <Text style={styles.hint}>
            {weights.length} weigh-in{weights.length === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      {!loading && smoothedNow == null ? (
        <Text style={styles.empty}>
          Log your weight now and then — you'll see a smoothed trend, so a normal daily
          fluctuation never throws you off.
        </Text>
      ) : null}

      {smoothedNow != null ? (
        <>
          <View style={styles.readout}>
            <Text style={styles.big}>
              {round(smoothedNow, 1)}
              <Text style={styles.unit}> kg</Text>
            </Text>
            {trend.length >= 2 ? (
              <Text style={[styles.change, { color: losing ? colors.success : colors.textMuted }]}>
                {change <= 0 ? '▾' : '▴'} {round(Math.abs(change), 1)} kg
              </Text>
            ) : null}
          </View>
          <Sparkline trend={trend} />
        </>
      ) : null}

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="Today's weight (kg)"
          placeholderTextColor={colors.textFaint}
          returnKeyType="done"
          onSubmitEditing={logIt}
        />
        <Button title={saving ? 'Saving…' : 'Log'} onPress={logIt} disabled={saving || !value} style={styles.logBtn} />
      </View>
      {saveErr ? <Text style={styles.err}>{saveErr}</Text> : null}
    </Card>
  );
}

/** A faint smoothed-trend bar sparkline (normalized so the gentle trend is visible
 *  even though every weigh-in sits near the same absolute kg). No SVG needed. */
function Sparkline({ trend }: { trend: number[] }) {
  if (trend.length < 2) return null;
  const lo = Math.min(...trend);
  const hi = Math.max(...trend);
  const span = hi - lo || 1;
  return (
    <View style={styles.spark}>
      {trend.map((v, i) => {
        const norm = (v - lo) / span; // 0..1
        return (
          <View key={i} style={styles.sparkCol}>
            <View style={[styles.sparkBar, { height: `${20 + norm * 80}%` }]} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: font.h3, fontWeight: '700', color: colors.text },
  hint: { fontSize: font.tiny, color: colors.textMuted, fontWeight: '600' },
  empty: { fontSize: font.small, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.sm },
  readout: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  big: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  unit: { fontSize: font.body, fontWeight: '700', color: colors.textMuted },
  change: { fontSize: font.small, fontWeight: '800', marginBottom: 4 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 3 },
  sparkCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  sparkBar: { width: '100%', backgroundColor: colors.primary, borderRadius: 3, opacity: 0.85, minHeight: 4 },
  form: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
    color: colors.text,
  },
  logBtn: { paddingHorizontal: spacing.xl },
  err: { fontSize: font.tiny, color: colors.danger, marginTop: spacing.sm },
});
