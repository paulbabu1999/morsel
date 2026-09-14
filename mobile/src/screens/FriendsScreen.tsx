import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { Button, Card, SectionTitle } from '../components/ui';
import {
  followUser,
  getConnections,
  getMe,
  searchUsers,
  setDisplayName,
  unfollowUser,
  type Connections,
  type MeResponse,
  type UserSummary,
} from '../api';
import { useAsync } from '../hooks/useAsync';

export function FriendsScreen() {
  const me = useAsync<MeResponse>(() => getMe(), []);
  const conn = useAsync<Connections>(() => getConnections(), []);

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <NameCard me={me.data} onSaved={() => me.reload()} />
      <FindPeople onChanged={() => conn.refresh()} />
      <ConnectionsCard conn={conn.data} loading={conn.loading} onChanged={() => conn.refresh()} />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function NameCard({ me, onSaved }: { me: MeResponse | null; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Seed the field from the loaded name once (until the user edits it).
  const seeded = React.useRef(false);
  if (me && !seeded.current && !dirty) {
    seeded.current = true;
    if (me.display_name) setName(me.display_name);
  }
  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await setDisplayName(name.trim());
      setDirty(false);
      onSaved();
    } catch {
      // surfaced inline is overkill here; keep it quiet
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card style={styles.card}>
      <SectionTitle>Your name</SectionTitle>
      <Text style={styles.hint}>This is how friends find and see you. Meals you share never show calories.</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setDirty(true);
          }}
          placeholder="Add a display name"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
        />
        <Button title={saving ? '…' : 'Save'} onPress={save} disabled={!name.trim() || saving} style={styles.rowBtn} />
      </View>
    </Card>
  );
}

function FindPeople({ onChanged }: { onChanged: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(query: string) {
    setQ(query);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(query.trim()));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function toggle(u: UserSummary) {
    setBusy(u.user_id);
    try {
      if (u.following) await unfollowUser(u.user_id);
      else await followUser(u.user_id);
      setResults((prev) =>
        prev.map((r) => (r.user_id === u.user_id ? { ...r, following: !u.following } : r)),
      );
      onChanged();
    } catch {
      // ignore; UI stays as-is
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <SectionTitle>Find people</SectionTitle>
      <TextInput
        style={styles.inputFull}
        value={q}
        onChangeText={run}
        placeholder="Search by name"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} /> : null}
      {!searching && q.trim() && results.length === 0 ? (
        <Text style={styles.emptyMini}>No one found. They may need to set a display name first.</Text>
      ) : null}
      {results.map((u) => (
        <PersonRow
          key={u.user_id}
          name={u.display_name}
          following={u.following}
          busy={busy === u.user_id}
          onPress={() => toggle(u)}
        />
      ))}
    </Card>
  );
}

function ConnectionsCard({
  conn,
  loading,
  onChanged,
}: {
  conn: Connections | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function unfollow(userId: string) {
    setBusy(userId);
    try {
      await unfollowUser(userId);
      onChanged();
    } finally {
      setBusy(null);
    }
  }
  if (loading) return null;
  const following = conn?.following ?? [];
  const followers = conn?.followers ?? [];
  return (
    <Card style={styles.card}>
      <SectionTitle>Following ({following.length})</SectionTitle>
      {following.length === 0 ? (
        <Text style={styles.emptyMini}>Follow someone above to see their shared meals in your feed.</Text>
      ) : (
        following.map((u) => (
          <PersonRow
            key={u.user_id}
            name={u.display_name}
            following
            busy={busy === u.user_id}
            onPress={() => unfollow(u.user_id)}
          />
        ))
      )}
      {followers.length ? (
        <>
          <SectionTitle style={styles.section}>Followers ({followers.length})</SectionTitle>
          {followers.map((u) => (
            <View key={u.user_id} style={styles.personRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(u.display_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.personName}>{u.display_name}</Text>
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

function PersonRow({
  name,
  following,
  busy,
  onPress,
}: {
  name: string;
  following?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.personRow}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.personName} numberOfLines={1}>
        {name}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.8}
        style={[styles.followBtn, following ? styles.followingBtn : styles.notFollowingBtn]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={following ? colors.textMuted : colors.onPrimary} />
        ) : (
          <Text style={[styles.followText, following ? styles.followingText : styles.notFollowingText]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  card: { marginBottom: spacing.lg },
  hint: { fontSize: font.small, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 19 },
  section: { marginTop: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowBtn: { paddingHorizontal: spacing.lg },
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
  inputFull: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: font.body,
    color: colors.text,
  },
  emptyMini: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.md, lineHeight: 19 },
  personRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: font.small, fontWeight: '800', color: colors.primaryDark },
  personName: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.text },
  followBtn: {
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  notFollowingBtn: { backgroundColor: colors.primary },
  followingBtn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  followText: { fontSize: font.small, fontWeight: '700' },
  notFollowingText: { color: colors.onPrimary },
  followingText: { color: colors.textMuted },
});
