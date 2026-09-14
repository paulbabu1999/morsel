import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing } from '../theme';
import { Header } from '../components/Header';
import { FeedCard } from '../components/FeedCard';
import { Loading, ErrorView, EmptyView } from '../components/StateViews';
import { getFeed, type FeedItem } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CommunityScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, error, reload, refresh, refreshing } = useAsync<FeedItem[]>(() => getFeed(), []);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const nav = (
    <View style={styles.navRow}>
      <TouchableOpacity style={styles.navPill} onPress={() => navigation.navigate('Friends')} activeOpacity={0.8}>
        <Text style={styles.navPillText}>👥 Friends</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.navPill} onPress={() => navigation.navigate('Groups')} activeOpacity={0.8}>
        <Text style={styles.navPillText}>🧑‍🤝‍🧑 Groups</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Community" subtitle="Meals shared by people you follow" right={nav} />

      {loading ? (
        <Loading label="Loading your feed…" />
      ) : error ? (
        <ErrorView error={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyView
          emoji="🤝"
          title="Your feed is quiet"
          subtitle="Follow friends or join a group, then share a meal to start the conversation."
        />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => <FeedCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  navRow: { flexDirection: 'row', gap: spacing.sm },
  navPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  navPillText: { fontSize: font.tiny, fontWeight: '700', color: colors.text },
  list: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  sep: { height: spacing.md },
});
