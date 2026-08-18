import React, { useEffect, useState } from 'react';
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
import { colors, font, radius, spacing } from '../theme';
import { Header } from '../components/Header';
import { Badge, Button, Card, SectionTitle } from '../components/ui';
import { NutrientChips } from '../components/Nutrition';
import { Loading, ErrorView } from '../components/StateViews';
import {
  ApiError,
  getProfile,
  saveProfile,
  type ActivityLevel,
  type GoalType,
  type Profile,
  type ProfileInput,
  type Sex,
} from '../api';
import { capitalize, round, withCommas } from '../utils/format';
import { useAuth } from '../auth/AuthContext';

const SEXES: Sex[] = ['male', 'female'];
const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const GOALS: GoalType[] = ['lose', 'maintain', 'gain'];
const RATES = ['0.25kg/week', '0.5kg/week', '0.75kg/week'];

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Light',
  moderate: 'Moderate',
  active: 'Active',
  very_active: 'Very active',
};

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await getProfile();
      setProfile(p);
      setEditing(p == null); // no profile yet → jump straight into onboarding
    } catch (e) {
      setLoadError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = (p: Profile) => {
    setProfile(p);
    setEditing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header
        title="Profile"
        subtitle={profile && !editing ? 'Your personalized targets' : 'Set up your calorie goal'}
      />
      <View style={styles.flex}>
        {loading ? (
          <Loading label="Loading your profile…" />
        ) : loadError ? (
          <ErrorView error={loadError} onRetry={load} />
        ) : editing ? (
          <ProfileForm
            initial={profile}
            isOnboarding={profile == null}
            onSaved={onSaved}
            onCancel={profile ? () => setEditing(false) : undefined}
          />
        ) : profile ? (
          <ProfileView profile={profile} onEdit={() => setEditing(true)} />
        ) : null}
      </View>
      <AccountBar email={user?.email} onLogout={() => void signOut()} />
    </SafeAreaView>
  );
}

/** Always-visible footer: which account you're in + a one-tap logout. */
function AccountBar({ email, onLogout }: { email?: string; onLogout: () => void }) {
  return (
    <View style={styles.accountBar}>
      <View style={styles.accountInfo}>
        <Text style={styles.accountLabel}>Signed in as</Text>
        <Text style={styles.accountEmail} numberOfLines={1}>
          {email ?? '—'}
        </Text>
      </View>
      <TouchableOpacity onPress={onLogout} style={styles.logoutBtn} activeOpacity={0.8}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------
function ProfileView({ profile: p, onEdit }: { profile: Profile; onEdit: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Card style={styles.targetCard}>
        <Text style={styles.targetLabel}>Daily calorie target</Text>
        <Text style={styles.targetValue}>{withCommas(p.daily_calorie_target)}</Text>
        <Text style={styles.targetUnit}>kcal / day</Text>
        <View style={styles.targetMetaRow}>
          <Badge
            label={p.goal_type === 'maintain' ? 'Maintain weight' : `${capitalize(p.goal_type)} · ${p.goal_rate}`}
            color={colors.primaryDark}
            bg={colors.primarySoft}
          />
          <Text style={styles.tdee}>TDEE ≈ {withCommas(p.tdee_estimate)} kcal</Text>
        </View>
      </Card>

      <SectionTitle style={styles.section}>Macro targets</SectionTitle>
      <Card>
        <NutrientChips
          items={[
            { label: 'Protein', value: `${round(p.protein_target_g)} g` },
            { label: 'Carbs', value: `${round(p.carb_target_g)} g` },
            { label: 'Fat', value: `${round(p.fat_target_g)} g` },
          ]}
        />
      </Card>

      <SectionTitle style={styles.section}>Micronutrient goals</SectionTitle>
      <Card>
        <NutrientChips
          items={[
            { label: 'Fiber', value: `${round(p.fiber_target_g, 1)} g` },
            { label: 'Sugar max', value: `${round(p.sugar_limit_g)} g` },
            { label: 'Sodium max', value: `${withCommas(p.sodium_limit_mg)} mg` },
            { label: 'Sat fat max', value: `${round(p.satfat_limit_g)} g` },
            { label: 'Iron', value: `${round(p.iron_target_mg, 1)} mg` },
            { label: 'Calcium', value: `${withCommas(p.calcium_target_mg)} mg` },
            { label: 'Potassium', value: `${withCommas(p.potassium_target_mg)} mg` },
          ]}
        />
      </Card>

      <SectionTitle style={styles.section}>How these were set</SectionTitle>
      <Card style={styles.rationaleCard}>
        <Badge
          label={p.target_source === 'llm' ? '✨ Personalized by Claude' : '📐 Formula-based'}
          color={p.target_source === 'llm' ? colors.semantic : colors.textMuted}
          bg={p.target_source === 'llm' ? colors.semanticSoft : colors.surfaceAlt}
          style={styles.rationaleBadge}
        />
        <Text style={styles.rationale}>{p.rationale}</Text>
      </Card>

      <SectionTitle style={styles.section}>About you</SectionTitle>
      <Card>
        <FactRow label="Age" value={`${p.age}`} />
        <FactRow label="Sex" value={capitalize(String(p.sex))} />
        <FactRow label="Height" value={`${round(p.height_cm)} cm`} />
        <FactRow label="Weight" value={`${round(p.weight_kg, 1)} kg`} />
        <FactRow label="Activity" value={ACTIVITY_LABEL[p.activity_level] ?? capitalize(p.activity_level)} />
        <FactRow label="Goal" value={p.goal_type === 'maintain' ? 'Maintain' : `${capitalize(p.goal_type)} (${p.goal_rate})`} last />
      </Card>

      <Button title="Edit profile" onPress={onEdit} variant="secondary" style={styles.editBtn} />
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function FactRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.factRow, last && styles.factRowLast]}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Form / onboarding mode
// ---------------------------------------------------------------------------
function ProfileForm({
  initial,
  isOnboarding,
  onSaved,
  onCancel,
}: {
  initial: Profile | null;
  isOnboarding: boolean;
  onSaved: (p: Profile) => void;
  onCancel?: () => void;
}) {
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [sex, setSex] = useState<Sex>((initial?.sex as Sex) || 'male');
  const [height, setHeight] = useState(initial ? String(round(initial.height_cm)) : '');
  const [weight, setWeight] = useState(initial ? String(round(initial.weight_kg, 1)) : '');
  const [activity, setActivity] = useState<ActivityLevel>(initial?.activity_level || 'moderate');
  const [goal, setGoal] = useState<GoalType>(initial?.goal_type || 'maintain');
  const [rate, setRate] = useState(
    initial && initial.goal_type !== 'maintain' ? initial.goal_rate : '0.5kg/week',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const ageN = Number(age);
    const heightN = Number(height);
    const weightN = Number(weight);
    if (!Number.isFinite(ageN) || ageN <= 0 || ageN > 120) {
      setError('Enter a valid age.');
      return;
    }
    if (!Number.isFinite(heightN) || heightN < 80 || heightN > 260) {
      setError('Enter a valid height in cm.');
      return;
    }
    if (!Number.isFinite(weightN) || weightN < 25 || weightN > 400) {
      setError('Enter a valid weight in kg.');
      return;
    }
    setError(null);
    setSaving(true);
    const input: ProfileInput = {
      age: Math.round(ageN),
      sex,
      height_cm: heightN,
      weight_kg: weightN,
      activity_level: activity,
      goal_type: goal,
      goal_rate: goal === 'maintain' ? '0kg/week' : rate,
    };
    try {
      const p = await saveProfile(input);
      onSaved(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isOnboarding ? (
          <Card style={[styles.block, styles.introCard]}>
            <Text style={styles.introTitle}>👋 Welcome to Bite</Text>
            <Text style={styles.introBody}>
              Tell us a bit about yourself and we'll set a daily calorie goal plus personalized nutrient
              targets. You can change these any time.
            </Text>
          </Card>
        ) : null}

        <SectionTitle>Age</SectionTitle>
        <TextInput
          style={styles.input}
          placeholder="29"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          value={age}
          onChangeText={setAge}
          maxLength={3}
        />

        <SectionTitle style={styles.sectionSpacing}>Sex</SectionTitle>
        <View style={styles.chipRow}>
          {SEXES.map((s) => (
            <SelectChip key={s} label={capitalize(s)} active={sex === s} onPress={() => setSex(s)} />
          ))}
        </View>

        <View style={styles.dualRow}>
          <View style={styles.dualCol}>
            <SectionTitle style={styles.sectionSpacing}>Height (cm)</SectionTitle>
            <TextInput
              style={styles.input}
              placeholder="178"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={height}
              onChangeText={setHeight}
              maxLength={5}
            />
          </View>
          <View style={styles.dualCol}>
            <SectionTitle style={styles.sectionSpacing}>Weight (kg)</SectionTitle>
            <TextInput
              style={styles.input}
              placeholder="75"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              maxLength={5}
            />
          </View>
        </View>

        <SectionTitle style={styles.sectionSpacing}>Activity level</SectionTitle>
        <View style={styles.chipRow}>
          {ACTIVITY.map((a) => (
            <SelectChip
              key={a}
              label={ACTIVITY_LABEL[a]}
              active={activity === a}
              onPress={() => setActivity(a)}
            />
          ))}
        </View>

        <SectionTitle style={styles.sectionSpacing}>Goal</SectionTitle>
        <View style={styles.chipRow}>
          {GOALS.map((g) => (
            <SelectChip key={g} label={capitalize(g)} active={goal === g} onPress={() => setGoal(g)} />
          ))}
        </View>

        {goal !== 'maintain' ? (
          <>
            <SectionTitle style={styles.sectionSpacing}>Rate ({goal === 'lose' ? 'loss' : 'gain'})</SectionTitle>
            <View style={styles.chipRow}>
              {RATES.map((r) => (
                <SelectChip key={r} label={r.replace('kg/week', ' kg/wk')} active={rate === r} onPress={() => setRate(r)} />
              ))}
            </View>
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title={isOnboarding ? 'Create my plan' : 'Save changes'}
          onPress={submit}
          loading={saving}
          style={styles.submit}
        />
        {onCancel ? (
          <Button title="Cancel" onPress={onCancel} variant="secondary" style={styles.cancelBtn} />
        ) : null}
        <Text style={styles.disclaimer}>
          Targets are derived on the backend (a single Claude call, or a Mifflin-St Jeor formula fallback
          when no API key is set).
        </Text>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SelectChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[styles.selChip, active && styles.selChipActive]}
    >
      <Text style={[styles.selChipText, active && styles.selChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  block: { marginBottom: spacing.lg },
  section: { marginTop: spacing.xl },
  sectionSpacing: { marginTop: spacing.lg },

  // view mode
  targetCard: { alignItems: 'center', paddingVertical: spacing.xl },
  targetLabel: { fontSize: font.tiny, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  targetValue: { fontSize: 52, fontWeight: '800', color: colors.primary, letterSpacing: -1, marginTop: spacing.xs },
  targetUnit: { fontSize: font.small, color: colors.textMuted, fontWeight: '600', marginTop: -2 },
  targetMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  tdee: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },

  rationaleCard: { backgroundColor: colors.surfaceAlt },
  rationaleBadge: { marginBottom: spacing.sm },
  rationale: { fontSize: font.small, color: colors.text, lineHeight: 20 },

  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  factRowLast: { borderBottomWidth: 0 },
  factLabel: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  factValue: { fontSize: font.small, color: colors.text, fontWeight: '700' },
  editBtn: { marginTop: spacing.xl },

  // form mode
  introCard: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  introTitle: { fontSize: font.h3, fontWeight: '800', color: colors.primaryDark, marginBottom: spacing.xs },
  introBody: { fontSize: font.small, color: colors.text, lineHeight: 20 },

  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
  },
  dualRow: { flexDirection: 'row', gap: spacing.md },
  dualCol: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  selChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  selChipText: { fontSize: font.small, fontWeight: '600', color: colors.textMuted },
  selChipTextActive: { color: colors.primaryDark },

  error: { color: colors.danger, fontSize: font.small, marginTop: spacing.lg, fontWeight: '600' },
  submit: { marginTop: spacing.xl },
  cancelBtn: { marginTop: spacing.md },
  disclaimer: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing.md, lineHeight: 16, textAlign: 'center' },

  // account / logout footer
  accountBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  accountInfo: { flex: 1 },
  accountLabel: {
    fontSize: font.tiny,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  accountEmail: { fontSize: font.small, fontWeight: '700', color: colors.text, marginTop: 1 },
  logoutBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  logoutText: { color: colors.primary, fontSize: font.small, fontWeight: '800' },
});
