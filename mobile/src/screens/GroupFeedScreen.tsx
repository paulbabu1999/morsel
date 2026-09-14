import React from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { colors, spacing } from '../theme';
import { FeedCard } from '../components/FeedCard';
import { Loading, ErrorView, EmptyView } from '../components/StateViews';
import { getGroupFeed, type FeedItem } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';

export function GroupFeedScreen({ route }: { route: RouteProp<RootStackParamList, 'GroupFeed'> }) {
  const { groupId } = route.params;
  const { data, loading, error, reload, refresh, refreshing } = useAsync<FeedItem[]>(
    () => getGroupFeed(groupId),
    [groupId],
  );

  if (loading) return <View style={styles.fill}><Loading label="Loading group feed…" /></View>;
  if (error) return <View style={styles.fill}><ErrorView error={error} onRetry={reload} /></View>;

  return (
    <View style={styles.fill}>
      {!data || data.length === 0 ? (
        <EmptyView
          emoji="🍱"
          title="No shared meals yet"
          subtitle="Share a meal to this group from any meal's detail screen."
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
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sep: { height: spacing.md },
});
