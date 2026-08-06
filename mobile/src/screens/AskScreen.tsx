import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing } from '../theme';
import { Header } from '../components/Header';
import { Button, Card, RouteBadge, routeMeta, SectionTitle } from '../components/ui';
import { MealCiteCard } from '../components/MealCard';
import { ErrorView } from '../components/StateViews';
import { ApiError, askQuery, getQueryExamples, type QueryResponse } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AskScreen() {
  const navigation = useNavigation<Nav>();
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const examples = useAsync<string[]>(() => getQueryExamples(), []);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setAsking(true);
    setError(null);
    try {
      setResult(await askQuery(text));
    } catch (e) {
      setError(e);
      setResult(null);
    } finally {
      setAsking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Ask" subtitle="Query your food memory in plain English" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.askBox}>
            <TextInput
              style={styles.input}
              placeholder="How much protein did I eat this week?"
              placeholderTextColor={colors.textFaint}
              value={question}
              onChangeText={setQuestion}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => ask(question)}
            />
            <Button title="Ask" onPress={() => ask(question)} loading={asking} style={styles.askBtn} />
          </View>

          {/* Suggested questions */}
          {!result && !asking ? (
            <View style={styles.suggestWrap}>
              <Text style={styles.suggestLabel}>Try asking</Text>
              {examples.loading ? (
                <Text style={styles.suggestHint}>Loading suggestions…</Text>
              ) : examples.error ? (
                <Text style={styles.suggestHint}>Start the backend to load suggested questions.</Text>
              ) : (
                <View style={styles.chips}>
                  {(examples.data ?? []).map((ex) => (
                    <TouchableOpacity key={ex} activeOpacity={0.8} onPress={() => ask(ex)} style={styles.chip}>
                      <Text style={styles.chipText}>{ex}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {/* Result */}
          {error ? (
            <View style={styles.errorWrap}>
              <ErrorView error={error} onRetry={() => ask(question)} />
            </View>
          ) : null}

          {result ? (
            <AnswerBlock
              result={result}
              onOpenMeal={(id) => navigation.navigate('MealDetail', { mealId: id })}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AnswerBlock({ result, onOpenMeal }: { result: QueryResponse; onOpenMeal: (id: string) => void }) {
  const meta = routeMeta(result.route);
  return (
    <View style={styles.answerWrap}>
      {/* Prominent route badge — the whole "which retrieval path" story */}
      <View style={styles.routeHeader}>
        <RouteBadge route={result.route} large />
        <Text style={styles.routeBlurb}>{meta.blurb}</Text>
      </View>

      <Card style={[styles.answerCard, { borderColor: meta.color }]}>
        <Text style={styles.answer}>{result.answer}</Text>
      </Card>

      <Card style={styles.routerCard}>
        <Text style={styles.routerLabel}>Router note</Text>
        <Text style={styles.routerNote}>{result.router_note}</Text>
      </Card>

      <DataBlock data={result.data} />

      {result.sql ? (
        <Card style={styles.sqlCard}>
          <Text style={styles.sqlLabel}>Generated SQL</Text>
          <Text style={styles.sqlText}>{result.sql}</Text>
        </Card>
      ) : null}

      {result.meals.length ? (
        <>
          <SectionTitle style={styles.section}>
            Supporting meals ({result.meals.length})
          </SectionTitle>
          <View style={styles.cites}>
            {result.meals.slice(0, 12).map((m) => (
              <MealCiteCard key={m.id} meal={m} onPress={() => onOpenMeal(m.id)} />
            ))}
          </View>
          {result.meals.length > 12 ? (
            <Text style={styles.moreCites}>+{result.meals.length - 12} more</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Render primitive key/values from the structured `data` dict backing the answer. */
function DataBlock({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v),
  );
  if (!entries.length) return null;
  return (
    <Card style={styles.dataCard}>
      <Text style={styles.routerLabel}>Backing data</Text>
      <View style={styles.dataGrid}>
        {entries.map(([k, v]) => (
          <View key={k} style={styles.dataItem}>
            <Text style={styles.dataKey}>{k.replace(/_/g, ' ')}</Text>
            <Text style={styles.dataVal}>{v == null ? '—' : String(v)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl * 2 },

  askBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  input: { fontSize: font.body, color: colors.text, minHeight: 48, textAlignVertical: 'top' },
  askBtn: { marginTop: spacing.sm },

  suggestWrap: { marginTop: spacing.xl },
  suggestLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.md },
  suggestHint: { fontSize: font.small, color: colors.textMuted },
  chips: { gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  chipText: { fontSize: font.small, color: colors.text, fontWeight: '500' },

  errorWrap: { minHeight: 260 },

  answerWrap: { marginTop: spacing.lg },
  routeHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  routeBlurb: { fontSize: font.small, color: colors.textMuted, fontWeight: '600', flexShrink: 1 },
  answerCard: { borderWidth: 1.5, marginBottom: spacing.md },
  answer: { fontSize: font.h3, fontWeight: '700', color: colors.text, lineHeight: 26 },
  routerCard: { backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  routerLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.xs },
  routerNote: { fontSize: font.small, color: colors.text, lineHeight: 19 },

  sqlCard: { backgroundColor: '#1E211D', borderColor: '#1E211D', marginBottom: spacing.md },
  sqlLabel: { fontSize: font.tiny, fontWeight: '800', color: '#9AA096', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.xs },
  sqlText: {
    fontSize: font.tiny,
    color: '#E8E5DC',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  dataCard: { marginBottom: spacing.md },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  dataItem: { minWidth: '44%', flexGrow: 1 },
  dataKey: { fontSize: font.tiny, color: colors.textMuted, textTransform: 'capitalize' },
  dataVal: { fontSize: font.body, fontWeight: '700', color: colors.text },

  section: { marginTop: spacing.lg },
  cites: { gap: spacing.sm },
  moreCites: { fontSize: font.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
});
