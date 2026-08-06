import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, spacing } from '../theme';
import { Header } from '../components/Header';
import { MealCard } from '../components/MealCard';
import { Loading, ErrorView, EmptyView } from '../components/StateViews';
import { getMeals, type Meal, type MealType } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';
import { capitalize } from '../utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const FILTERS: (MealType | 'all')[] = ['all', 'breakfast', 'lunch', 'dinner', 'snack'];

export function FeedScreen() {
  const navigation = useNavigation<Nav>();
  const [filter, setFilter] = useState<MealType | 'all'>('all');

  const { data, loading, error, reload, refresh, refreshing } = useAsync<Meal[]>(
    () => getMeals(filter === 'all' ? { limit: 200 } : { meal_type: filter, limit: 200 }),
    [filter],
  );

  // Refetch when returning to the tab (e.g. after logging a meal on Capture).
  useFocusEffect(
    React.useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Feed" subtitle={data ? `${data.length} meals logged` : 'Your food memory'} />

      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            activeOpacity={0.8}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : capitalize(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Loading label="Loading meals…" />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyView
          title="No meals yet"
          subtitle="Capture a meal to start building your food memory."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <MealCard meal={item} onPress={() => navigation.navigate('MealDetail', { mealId: item.id })} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  filterTextActive: { color: colors.onPrimary },
  list: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  sep: { height: spacing.md },
});
