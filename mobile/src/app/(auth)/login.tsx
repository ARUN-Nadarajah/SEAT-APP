import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Field, InfoBox } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { validateAuthEmail, validateAuthPassword } from '@/features/auth/utils/validation';
import { colors, spacing } from '@/theme';

/**
 * Login (spec §5 + NFR04: privacy notice on the login/register screen).
 * After a successful sign-in the root router sends the user to their own
 * role's interface (spec §2).
 */
export default function LoginScreen() {
  const { login, isLoading, feedback, clearFeedback, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email: string | null; password: string | null }>({
    email: null,
    password: null,
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated]);

  // Derived instead of mirrored into state: the React compiler rejects
  // setState calls inside effects, and this value never needs to persist.
  const shownError =
    feedback?.type === 'warning' ? feedback.message : formError;

  async function onSubmit() {
    clearFeedback();
    const nextErrors = {
      email: validateAuthEmail(email),
      password: validateAuthPassword(password),
    };
    setErrors(nextErrors);
    if (nextErrors.email || nextErrors.password) return;

    setFormError(null);
    try {
      await login(email.trim(), password);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to sign you in right now.',
      );
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <AppText style={styles.brandGlyph}>S</AppText>
            </View>
            <AppText variant="display">Welcome back</AppText>
            <AppText variant="secondary" style={styles.subtitle}>
              Sign in to reserve tables and join virtual queues.
            </AppText>
          </View>

          <View style={styles.form}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email ?? undefined}
              testID="login-email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              error={errors.password ?? undefined}
              onSubmitEditing={onSubmit}
              returnKeyType="done"
              testID="login-password"
            />

            {shownError ? (
              <InfoBox tone="danger">
                <AppText variant="label">{shownError}</AppText>
              </InfoBox>
            ) : null}

            <Link href="/(auth)/forgot-password" asChild>
              <Pressable accessibilityRole="button" style={styles.forgot}>
                <AppText variant="label" style={styles.link}>
                  Forgot your password?
                </AppText>
              </Pressable>
            </Link>

            <Button label="Sign in" onPress={onSubmit} loading={isLoading} testID="login-submit" />
          </View>

          {/* NFR04 — privacy notice shown before the user commits. */}
          <InfoBox tone="warning">
            <AppText variant="label">Your privacy</AppText>
            <AppText variant="secondary">
              We store your name, email and phone to manage your bookings. We
              never collect or store payment card details. You can delete your
              account at any time from Profile.
            </AppText>
          </InfoBox>

          {/* Demo credentials from the seed script (README §Demo accounts). */}
          <InfoBox tone="info">
            <AppText variant="label">Demo accounts</AppText>
            <AppText variant="secondary">
              customer@seat.lk · staff@seat.lk · manager@seat.lk
              {'\n'}Password: Password123!
            </AppText>
          </InfoBox>

          <View style={styles.footer}>
            <AppText variant="secondary">New to SEAT?</AppText>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="button">
                <AppText variant="label" style={styles.link}>
                  Create an account
                </AppText>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing['2xl'], gap: spacing['2xl'], paddingBottom: spacing['4xl'] },
  brand: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: radiusBrand(),
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  brandGlyph: { color: colors.accent, fontSize: 28, fontFamily: 'Fraunces_600SemiBold' },
  subtitle: { textAlign: 'center', maxWidth: 300 },
  form: { gap: spacing.lg },
  forgot: { alignSelf: 'flex-end', paddingVertical: spacing.xs },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});

function radiusBrand() {
  return 20;
}
