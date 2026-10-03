import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Chip, Field, InfoBox } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import {
  validateAuthEmail,
  validateAuthName,
  validateAuthOtp,
  validateAuthPassword,
  validateAuthPhone,
  validateConfirmPassword,
} from '@/features/auth/utils/validation';
import { colors, spacing } from '@/theme';

type Role = 'customer' | 'staff' | 'manager';

const ROLE_OPTIONS: { value: Role; label: string; blurb: string }[] = [
  { value: 'customer', label: 'Customer', blurb: 'Book tables & join queues' },
  { value: 'staff', label: 'Restaurant staff', blurb: 'Run the floor' },
  { value: 'manager', label: 'Manager', blurb: 'Reports & summaries' },
];

/**
 * Register (spec §5: "role selection for demo") + privacy notice (NFR04).
 * Two steps in one screen: details → email OTP, keeping the flow short.
 */
export default function RegisterScreen() {
  const {
    requestRegisterOtp,
    verifyRegisterOtp,
    isAuthenticated,
    isLoading,
    feedback,
    clearFeedback,
  } = useAuth();

  const [role, setRole] = useState<Role>('customer');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated]);

  // Derived from context rather than copied into state inside an effect.
  const shownError =
    feedback?.type === 'warning' ? feedback.message : formError;

  async function requestOtp() {
    clearFeedback();
    const nextErrors = {
      fullName: validateAuthName(fullName),
      email: validateAuthEmail(email),
      phone: validateAuthPhone(phone),
      password: validateAuthPassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setFormError(null);
    try {
      await requestRegisterOtp({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
      });
      setOtpRequested(true);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'We couldn’t start your registration.',
      );
    }
  }

  async function verifyOtp() {
    clearFeedback();
    const otpError = validateAuthOtp(otp);
    setErrors({ otp: otpError });
    if (otpError) return;

    setFormError(null);
    try {
      await verifyRegisterOtp(email.trim(), otp.trim());
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'That code didn’t work. Try again.',
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
          <View style={styles.header}>
            <AppText variant="display">
              {otpRequested ? 'Check your email' : 'Create your account'}
            </AppText>
            <AppText variant="secondary">
              {otpRequested
                ? `We sent a 6-digit code to ${email}.`
                : 'A minute now saves you a queue later.'}
            </AppText>
          </View>

          {!otpRequested ? (
            <View style={styles.form}>
              {/* Spec §5 — role selection for demo accounts. */}
              <View style={styles.block}>
                <AppText variant="label" style={styles.blockLabel}>
                  I’m signing in as
                </AppText>
                <View style={styles.roleRow}>
                  {ROLE_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={role === option.value}
                      onPress={() => setRole(option.value)}
                    />
                  ))}
                </View>
                <AppText variant="caption">
                  {ROLE_OPTIONS.find((option) => option.value === role)?.blurb}
                </AppText>
              </View>

              <Field
                label="Full name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Anjali Rasiah"
                autoCapitalize="words"
                error={errors.fullName ?? undefined}
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                error={errors.email ?? undefined}
              />
              <Field
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+94 77 123 4567"
                keyboardType="phone-pad"
                error={errors.phone ?? undefined}
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
                error={errors.password ?? undefined}
              />
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat your password"
                secureTextEntry
                error={errors.confirmPassword ?? undefined}
                onSubmitEditing={requestOtp}
                returnKeyType="done"
              />

              {shownError ? (
                <InfoBox tone="danger">
                  <AppText variant="label">{shownError}</AppText>
                </InfoBox>
              ) : null}

              <Button
                label="Send verification code"
                onPress={requestOtp}
                loading={isLoading}
                testID="register-submit"
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                label="Verification code"
                value={otp}
                onChangeText={setOtp}
                placeholder="6-digit code"
                keyboardType="number-pad"
                maxLength={6}
                error={errors.otp ?? undefined}
                hint="Hint: check the server console — emails are logged when SMTP is not configured."
              />

              {shownError ? (
                <InfoBox tone="danger">
                  <AppText variant="label">{shownError}</AppText>
                </InfoBox>
              ) : null}

              <Button label="Verify & create account" onPress={verifyOtp} loading={isLoading} />
              <Button
                label="Use a different email"
                variant="ghost"
                onPress={() => {
                  clearFeedback();
                  setOtpRequested(false);
                  setFormError(null);
                }}
              />
            </View>
          )}

          {/* NFR04 — privacy notice. */}
          <InfoBox tone="warning">
            <AppText variant="label">Privacy notice</AppText>
            <AppText variant="secondary">
              We collect only the details needed to hold your table and queue
              spot. Passwords are hashed, tokens are stored securely, and we
              never save payment card data.
            </AppText>
          </InfoBox>

          <View style={styles.footer}>
            <AppText variant="secondary">Already have an account?</AppText>
            <Link href="/(auth)/login" asChild>
              <Pressable accessibilityRole="button">
                <AppText variant="label" style={styles.link}>
                  Sign in
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
  header: { gap: spacing.xs, paddingTop: spacing.md },
  form: { gap: spacing.lg },
  block: { gap: spacing.sm },
  blockLabel: { color: colors.textSecondary },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
