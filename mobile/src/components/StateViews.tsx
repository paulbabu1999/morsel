import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';
import { ApiError } from '../api';
import { Button } from './ui';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const isNetwork = error instanceof ApiError && error.isNetwork;
  const message =
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>{isNetwork ? '🔌' : '⚠️'}</Text>
      <Text style={styles.title}>{isNetwork ? "Can't reach the backend" : 'Something went wrong'}</Text>
      <Text style={styles.body}>{message}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

export function EmptyView({ emoji = '🍽️', title, subtitle }: { emoji?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  muted: { marginTop: spacing.md, color: colors.textMuted, fontSize: font.body },
  emoji: { fontSize: 44, marginBottom: spacing.md },
  title: { fontSize: font.h3, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  body: { fontSize: font.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  retry: { marginTop: spacing.xl, paddingHorizontal: spacing.xxl, alignSelf: 'center' },
});
