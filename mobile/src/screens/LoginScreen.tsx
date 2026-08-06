import React, { useState } from 'react';
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
import { Button, Card } from '../components/ui';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api';

type Mode = 'login' | 'signup';

/** Turn a raw API/network error into a friendly, field-agnostic message. */
function friendlyError(err: unknown, isSignup: boolean): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Wrong email or password.';
    if (err.status === 409) return 'That email is already registered. Try logging in instead.';
    // 400/422 (e.g. password too short) carry a useful backend detail; network
    // failures carry the LAN-IP hint. Either way, the message is worth showing.
    if (err.message) return err.message;
    return isSignup ? "Couldn't create your account." : "Couldn't log you in.";
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Combined login / signup screen. Rendered only while logged out (the auth gate
 * in App.tsx swaps it out the moment the AuthProvider gains a user). Matches the
 * web app's UX: one card, a mode toggle, friendly inline errors.
 */
export function LoginScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  const onSubmit = async () => {
    setError(null);
    const mail = email.trim();
    if (!mail || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (isSignup && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) await signUp(mail, password);
      else await signIn(mail, password);
      // On success the AuthProvider flips `user`, and the gate unmounts us.
    } catch (err) {
      setError(friendlyError(err, isSignup));
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.brandRing}>
                <View style={styles.brandDot} />
              </View>
            </View>
            <View>
              <Text style={styles.brandName}>Morsel</Text>
              <Text style={styles.brandSub}>food memory</Text>
            </View>
          </View>

          <Card style={styles.card}>
            <Text style={styles.title}>{isSignup ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {isSignup
                ? 'Sign up to start capturing meals and tracking your nutrition.'
                : 'Log in to pick up your food memory where you left off.'}
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              returnKeyType="next"
            />

            <Text style={[styles.label, styles.labelSpacing]}>
              Password
              {isSignup ? <Text style={styles.labelHint}>  ·  at least 8 characters</Text> : null}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={isSignup ? 'Create a password' : 'Your password'}
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              textContentType={isSignup ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={onSubmit}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>ⓘ</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Button
              title={isSignup ? 'Create account' : 'Log in'}
              onPress={onSubmit}
              loading={busy}
              style={styles.submit}
            />

            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {isSignup ? 'Already have an account?' : 'New to Morsel?'}{' '}
              </Text>
              <TouchableOpacity onPress={toggleMode} disabled={busy} hitSlop={8}>
                <Text style={styles.toggleLink}>{isSignup ? 'Log in' : 'Create one'}</Text>
              </TouchableOpacity>
            </View>
          </Card>

          <Text style={styles.footnote}>
            Your data is private to your account. The hosted backend may take a moment to wake up on
            the first request.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.6,
    borderColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryDark },
  brandName: { fontSize: font.h2, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  brandSub: { fontSize: font.small, color: colors.textMuted, marginTop: -2 },

  card: { padding: spacing.xl },
  title: { fontSize: font.h2, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: {
    fontSize: font.small,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },

  label: { fontSize: font.small, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  labelSpacing: { marginTop: spacing.lg },
  labelHint: { fontSize: font.tiny, fontWeight: '600', color: colors.textFaint },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: font.body,
    color: colors.text,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorIcon: { fontSize: font.body, color: colors.danger, fontWeight: '800', lineHeight: 20 },
  errorText: { flex: 1, fontSize: font.small, color: colors.danger, fontWeight: '600', lineHeight: 19 },

  submit: { marginTop: spacing.xl },

  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  toggleText: { fontSize: font.small, color: colors.textMuted },
  toggleLink: { fontSize: font.small, color: colors.primary, fontWeight: '800' },

  footnote: {
    fontSize: font.tiny,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
});
