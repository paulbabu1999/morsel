import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import type { FeedItem } from '../api';
import { capitalize, formatWhen } from '../utils/format';

/** One shared meal, in the home feed or a group feed. Deliberately carries NO
 *  calories/macros — it's supportive accountability (a photo + a note among
 *  friends), never a calorie scoreboard. */
export function FeedCard({ item }: { item: FeedItem }) {
  const who = item.is_me ? 'You' : item.display_name;
  const initial = (who || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.headText}>
          <Text style={styles.who} numberOfLines={1}>
            {who}
            {item.meal_type ? <Text style={styles.mealType}>  ·  {capitalize(item.meal_type)}</Text> : null}
          </Text>
          <Text style={styles.when}>{formatWhen(item.shared_at)}</Text>
        </View>
        {item.group_name ? (
          <View style={styles.groupPill}>
            <Text style={styles.groupPillText} numberOfLines={1}>
              {item.group_name}
            </Text>
          </View>
        ) : null}
      </View>

      {item.photo_uri ? (
        <Image source={{ uri: item.photo_uri }} style={styles.photo} resizeMode="cover" />
      ) : null}

      <Text style={styles.desc}>{item.description}</Text>
      {item.note ? <Text style={styles.note}>“{item.note}”</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: font.body, fontWeight: '800', color: colors.primaryDark },
  headText: { flex: 1 },
  who: { fontSize: font.body, fontWeight: '700', color: colors.text },
  mealType: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  when: { fontSize: font.tiny, color: colors.textFaint, marginTop: 1 },
  groupPill: {
    maxWidth: 120,
    backgroundColor: colors.hybridSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginLeft: spacing.sm,
  },
  groupPillText: { fontSize: font.tiny, fontWeight: '700', color: colors.hybrid },
  photo: { width: '100%', height: 180, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, marginTop: spacing.md },
  desc: { fontSize: font.body, color: colors.text, fontWeight: '600', marginTop: spacing.md, lineHeight: 21 },
  note: { fontSize: font.small, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.xs, lineHeight: 19 },
});
