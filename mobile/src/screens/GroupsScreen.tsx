import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, font, radius, spacing } from '../theme';
import { Button, Card, SectionTitle } from '../components/ui';
import { Loading } from '../components/StateViews';
import { ApiError, createGroup, getGroups, joinGroup, type GroupInfo } from '../api';
import { useAsync } from '../hooks/useAsync';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GroupsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, refresh } = useAsync<GroupInfo[]>(() => getGroups(), []);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await createGroup(name.trim());
      setName('');
      refresh();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not create the group.');
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const g = await joinGroup(code.trim());
      setCode('');
      setMsg(`Joined “${g.name}”.`);
      refresh();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not join — check the invite code.');
    } finally {
      setBusy(false);
    }
  }

  const groups = data ?? [];
  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={styles.card}>
        <SectionTitle>Start a group</SectionTitle>
        <Text style={styles.hint}>Share meals with a private group — a family, a challenge, a few friends.</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Group name"
            placeholderTextColor={colors.textFaint}
          />
          <Button title="Create" onPress={create} disabled={!name.trim() || busy} style={styles.rowBtn} />
        </View>
      </Card>

      <Card style={styles.card}>
        <SectionTitle>Join with a code</SectionTitle>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="Invite code"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="Join" onPress={join} variant="secondary" disabled={!code.trim() || busy} style={styles.rowBtn} />
        </View>
        {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      </Card>

      <SectionTitle style={styles.section}>Your groups</SectionTitle>
      {loading ? (
        <Loading label="Loading groups…" />
      ) : groups.length === 0 ? (
        <Text style={styles.emptyMini}>No groups yet. Create one or join with an invite code.</Text>
      ) : (
        groups.map((g) => (
          <TouchableOpacity
            key={g.id}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('GroupFeed', { groupId: g.id, name: g.name })}
          >
            <Card style={styles.groupCard}>
              <View style={styles.groupTop}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {g.name}
                </Text>
                {g.owner ? (
                  <View style={styles.ownerPill}>
                    <Text style={styles.ownerPillText}>Owner</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.groupMeta}>
                {g.member_count} member{g.member_count === 1 ? '' : 's'}
              </Text>
              {g.owner && g.invite_code ? (
                <Text style={styles.inviteCode}>
                  Invite code: <Text style={styles.inviteCodeStrong}>{g.invite_code}</Text>
                </Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg },
  card: { marginBottom: spacing.lg },
  hint: { fontSize: font.small, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 19 },
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
  msg: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.md },
  section: { marginBottom: spacing.md },
  emptyMini: { fontSize: font.small, color: colors.textMuted, lineHeight: 19 },
  groupCard: { marginBottom: spacing.md },
  groupTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupName: { flex: 1, fontSize: font.h3, fontWeight: '800', color: colors.text },
  ownerPill: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  ownerPillText: { fontSize: font.tiny, fontWeight: '800', color: colors.primaryDark },
  groupMeta: { fontSize: font.small, color: colors.textMuted, marginTop: 4 },
  inviteCode: { fontSize: font.small, color: colors.textMuted, marginTop: spacing.sm },
  inviteCodeStrong: { fontWeight: '800', color: colors.text, letterSpacing: 1 },
});
