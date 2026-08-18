import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { colors, font, radius, spacing } from '../theme';
import { Header } from '../components/Header';
import { Button, Card, SectionTitle } from '../components/ui';
import { CalorieRing, AdequacyBar } from '../components/Nutrition';
import { Loading, ErrorView, EmptyView } from '../components/StateViews';
import {
  getInsights,
  getStats,
  type Insight,
  type InsightsResponse,
  type InsightSeverity,
  type StatsPeriod,
  type StatsResponse,
} from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootTabParamList } from '../navigation/types';
import { capitalize, round, weekdayInitial, withCommas } from '../utils/format';

type Nav = BottomTabNavigationProp<RootTabParamList>;
const PERIODS: StatsPeriod[] = ['day', 'week', 'month'];
const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const PERIOD_CAPTION: Record<StatsPeriod, string> = {
  day: "Today's intake vs. your daily target",
  week: 'Avg per day this week vs. your target',
  month: 'Avg per day this month vs. your target',
};

export function StatsScreen() {
  const [period, setPeriod] = useState<StatsPeriod>('day');
  const { data, loading, error, reload, refresh, refreshing } = useAsync<StatsResponse>(
    () => getStats(period),
    [period],
  );
  const insights = useAsync<InsightsResponse>(() => getInsights(period), [period]);

  // Refetch when returning to the tab (e.g. after completing onboarding on the
  // Profile tab, or logging a meal) so the ring/targets aren't stale. Skips the
  // initial mount, which useAsync already loads.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refresh();
      insights.refresh();
    }, [refresh, insights]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Stats" subtitle="Your nutrition at a glance" />

      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            activeOpacity={0.8}
            onPress={() => setPeriod(p)}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {capitalize(p)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Loading label="Crunching numbers…" />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data ? (
        <EmptyView emoji="📊" title="No stats available" />
      ) : (
        <StatsContent
          data={data}
          insights={insights.data}
          period={period}
          refreshing={refreshing}
          onRefresh={refresh}
        />
      )}
    </SafeAreaView>
  );
}

function StatsContent({
  data,
  insights,
  period,
  refreshing,
  onRefresh,
}: {
  data: StatsResponse;
  insights: InsightsResponse | null;
  period: StatsPeriod;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const navigation = useNavigation<Nav>();
  const targets = data.targets;
  const adequacy = data.adequacy ?? [];
  const targetItems = adequacy.filter((a) => a.kind === 'target');
  const limitItems = adequacy.filter((a) => a.kind === 'limit');
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.range}>
        {data.start} → {data.end}
      </Text>

      {/* Calorie ring — intake vs. daily target (the core dashboard signal) */}
      <Card style={styles.ringCard}>
        {targets ? (
          <CalorieRing
            intake={Math.round(data.avg_calories_per_day)}
            target={targets.daily_calorie_target}
            caption={PERIOD_CAPTION[period]}
          />
        ) : (
          <View style={styles.setupPrompt}>
            <Text style={styles.setupEmoji}>🎯</Text>
            <Text style={styles.setupTitle}>Set a calorie goal</Text>
            <Text style={styles.setupBody}>
              Add your profile to unlock a personalized calorie ring and nutrient adequacy tracking.
            </Text>
            <Button
              title="Set up your profile"
              onPress={() => navigation.navigate('Profile')}
              style={styles.setupBtn}
            />
          </View>
        )}
      </Card>

      {/* Nutrient adequacy — micros vs. targets/limits */}
      {targets && adequacy.length ? (
        <>
          <SectionTitle style={styles.section}>Nutrient adequacy</SectionTitle>
          {targetItems.length ? (
            <Card style={styles.adqCard}>
              <Text style={styles.adqCaption}>Aim to hit these</Text>
              {targetItems.map((a) => (
                <AdequacyBar key={a.nutrient} item={a} />
              ))}
            </Card>
          ) : null}
          {limitItems.length ? (
            <Card style={styles.adqCard}>
              <Text style={styles.adqCaption}>Keep these under the limit</Text>
              {limitItems.map((a) => (
                <AdequacyBar key={a.nutrient} item={a} />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {/* Insights / advice */}
      {insights && insights.insights.length ? (
        <>
          <SectionTitle style={styles.section}>Insights</SectionTitle>
          <Card>
            <Text style={styles.insightHeadline}>{insights.headline}</Text>
            {insights.insights.map((i, idx) => (
              <InsightRow key={idx} item={i} last={idx === insights.insights.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      {/* KPI tiles */}
      <SectionTitle style={styles.section}>Summary</SectionTitle>
      <View style={styles.kpiGrid}>
        <Kpi label="Total calories" value={withCommas(data.total_calories)} accent={colors.calories} />
        <Kpi label="Avg cal / day" value={withCommas(data.avg_calories_per_day)} accent={colors.carbs} />
        <Kpi label="Avg protein / day" value={`${round(data.avg_protein_per_day)}g`} accent={colors.protein} />
        <Kpi label="Meals" value={String(data.total_meals)} accent={colors.text} />
        <Kpi
          label="Eat-out rate"
          value={`${Math.round(data.eat_out_rate * 100)}%`}
          sub={`${data.eat_out_meals} of ${data.total_meals}`}
          accent={colors.fat}
        />
      </View>

      {/* Calories by day */}
      <SectionTitle style={styles.section}>Calories by day</SectionTitle>
      <Card>
        <CaloriesChart data={data} />
      </Card>

      {/* Top foods */}
      {data.top_foods.length ? (
        <>
          <SectionTitle style={styles.section}>Top foods</SectionTitle>
          <Card>
            {data.top_foods.map((f, i) => (
              <View key={f.name} style={[styles.foodRow, i === data.top_foods.length - 1 && styles.lastRow]}>
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <Text style={styles.foodName} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text style={styles.foodCount}>×{f.count}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* Meal-type breakdown */}
      <SectionTitle style={styles.section}>By meal type</SectionTitle>
      <Card>
        <MealTypeBreakdown byType={data.by_meal_type} total={data.total_meals} />
      </Card>
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const SEVERITY_COLOR: Record<InsightSeverity, string> = {
  info: '#6f7889',
  suggest: '#3987e5',
  watch: '#f0a742',
};

function InsightRow({ item, last }: { item: Insight; last: boolean }) {
  return (
    <View style={[styles.insightRow, !last && styles.insightRowBorder]}>
      <View style={[styles.insightBar, { backgroundColor: SEVERITY_COLOR[item.severity] }]} />
      <View style={styles.insightBody}>
        <Text style={styles.insightTitle}>{item.title}</Text>
        <Text style={styles.insightDetail}>{item.detail}</Text>
      </View>
    </View>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={[styles.kpiValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub ? <Text style={styles.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function CaloriesChart({ data }: { data: StatsResponse }) {
  const days = data.by_day;
  if (!days.length) return <Text style={styles.emptyMini}>No daily data.</Text>;
  const max = Math.max(...days.map((d) => d.calories), 1);
  return (
    <View style={styles.chart}>
      {days.map((d) => {
        const pct = Math.max(d.calories / max, 0.02);
        return (
          <View key={d.date} style={styles.barCol}>
            <Text style={styles.barValue}>{d.calories > 0 ? Math.round(d.calories / 100) / 10 + 'k' : ''}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.barLabel}>{weekdayInitial(d.date)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MealTypeBreakdown({ byType, total }: { byType: Record<string, number>; total: number }) {
  const keys = MEAL_TYPE_ORDER.filter((k) => k in byType);
  const extra = Object.keys(byType).filter((k) => !MEAL_TYPE_ORDER.includes(k));
  const ordered = [...keys, ...extra];
  const safeTotal = total || ordered.reduce((s, k) => s + byType[k], 0) || 1;
  return (
    <View>
      {ordered.map((k, i) => {
        const count = byType[k] ?? 0;
        const pct = count / safeTotal;
        return (
          <View key={k} style={[styles.mtRow, i === ordered.length - 1 && styles.lastRow]}>
            <Text style={styles.mtName}>{capitalize(k)}</Text>
            <View style={styles.mtBarTrack}>
              <View style={[styles.mtBar, { width: `${Math.max(pct * 100, 2)}%` }]} />
            </View>
            <Text style={styles.mtCount}>{count}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  periodRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  periodChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodText: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  periodTextActive: { color: colors.onPrimary },

  content: { padding: spacing.lg, paddingTop: spacing.xs },
  range: { fontSize: font.small, color: colors.textMuted, marginBottom: spacing.md, fontWeight: '600' },

  ringCard: { alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.md },
  setupPrompt: { alignItems: 'center' },
  setupEmoji: { fontSize: 40, marginBottom: spacing.sm },
  setupTitle: { fontSize: font.h3, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  setupBody: { fontSize: font.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  setupBtn: { alignSelf: 'stretch', paddingHorizontal: spacing.xl },

  adqCard: { marginBottom: spacing.md },

  insightHeadline: { fontSize: font.body, fontWeight: '700', color: colors.text, marginBottom: spacing.md, lineHeight: 21 },
  insightRow: { flexDirection: 'row', paddingVertical: spacing.md },
  insightRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  insightBar: { width: 3, borderRadius: 2, marginRight: spacing.md },
  insightBody: { flex: 1 },
  insightTitle: { fontSize: font.small, fontWeight: '700', color: colors.text, marginBottom: 3 },
  insightDetail: { fontSize: font.small, color: colors.textMuted, lineHeight: 19 },
  adqCaption: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.md },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  kpi: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: '30%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  kpiValue: { fontSize: font.h2, fontWeight: '800' },
  kpiLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  kpiSub: { fontSize: font.tiny, color: colors.textFaint, marginTop: 1 },

  section: { marginTop: spacing.xl },

  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 170 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontSize: 9, color: colors.textFaint, marginBottom: 4, fontWeight: '600' },
  barTrack: { flex: 1, width: '62%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primary, borderTopLeftRadius: 5, borderTopRightRadius: 5, minHeight: 3 },
  barLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: 6, fontWeight: '600' },
  emptyMini: { fontSize: font.small, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },

  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastRow: { borderBottomWidth: 0 },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rankText: { fontSize: font.tiny, fontWeight: '800', color: colors.primaryDark },
  foodName: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.text },
  foodCount: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },

  mtRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  mtName: { width: 80, fontSize: font.small, fontWeight: '600', color: colors.text },
  mtBarTrack: { flex: 1, height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 5, marginHorizontal: spacing.md, overflow: 'hidden' },
  mtBar: { height: '100%', backgroundColor: colors.protein, borderRadius: 5 },
  mtCount: { width: 24, textAlign: 'right', fontSize: font.small, fontWeight: '700', color: colors.textMuted },
});
