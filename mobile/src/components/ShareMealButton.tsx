import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, font, radius, spacing } from '../theme';
import { Button, Chip } from './ui';
import { ApiError, getGroups, shareMeal, type GroupInfo } from '../api';

/** Share a meal to your followers or a specific group, with an optional note.
 *  Opens a lightweight sheet; the feed it lands in never shows calories. */
export function ShareMealButton({ mealId }: { mealId: string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [target, setTarget] = useState<string>('followers'); // 'followers' | groupId
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getGroups()
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [open]);

  function close() {
    setOpen(false);
    // reset after the sheet animates away
    setTimeout(() => {
      setTarget('followers');
      setNote('');
      setShared(false);
      setError(null);
    }, 250);
  }

  async function doShare() {
    if (sharing) return;
    setSharing(true);
    setError(null);
    try {
      await shareMeal(mealId, {
        group_id: target === 'followers' ? null : target,
        note: note.trim() || null,
      });
      setShared(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not share. Please try again.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Button title="＋ Share this meal" variant="secondary" onPress={() => setOpen(true)} style={styles.trigger} />

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            {shared ? (
              <View style={styles.doneWrap}>
                <Text style={styles.doneEmoji}>✅</Text>
                <Text style={styles.doneTitle}>Shared</Text>
                <Text style={styles.doneBody}>
                  Your friends will see the photo and note — never the calories.
                </Text>
                <Button title="Done" onPress={close} style={styles.doneBtn} />
              </View>
            ) : (
              <>
                <Text style={styles.title}>Share to</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <Chip label="Followers" selected={target === 'followers'} onPress={() => setTarget('followers')} />
                  {groups.map((g) => (
                    <Chip key={g.id} label={g.name} selected={target === g.id} onPress={() => setTarget(g.id)} />
                  ))}
                </ScrollView>

                <Text style={styles.label}>Add a note (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Homemade and actually good…"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  maxLength={280}
                />

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Button title={sharing ? 'Sharing…' : 'Share'} onPress={doShare} loading={sharing} style={styles.shareBtn} />
                <TouchableOpacity onPress={close} style={styles.cancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { marginTop: spacing.lg },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.lg },
  title: { fontSize: font.h3, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  chips: { gap: spacing.sm, paddingBottom: spacing.xs },
  label: { fontSize: font.small, fontWeight: '700', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  error: { fontSize: font.small, color: colors.danger, marginTop: spacing.md, fontWeight: '600' },
  shareBtn: { marginTop: spacing.lg },
  cancel: { marginTop: spacing.md, alignItems: 'center' },
  cancelText: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },
  doneWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  doneEmoji: { fontSize: 40, marginBottom: spacing.sm },
  doneTitle: { fontSize: font.h2, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  doneBody: { fontSize: font.small, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  doneBtn: { alignSelf: 'stretch' },
});
