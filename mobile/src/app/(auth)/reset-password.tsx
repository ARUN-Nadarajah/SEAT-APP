import { Link, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/features/auth/auth-context";
import { authTheme } from "@/features/auth/auth-theme";
import { AuthBanner, AuthShell } from "@/features/auth/components/auth-shell";
import {
  AuthButton,
  AuthField,
} from "@/features/auth/components/auth-controls";
import {
  validateAuthEmail,
  validateAuthOtp,
  validateAuthPassword,
  validateConfirmPassword,
} from "@/features/auth/utils/validation";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const {
    verifyPasswordResetOtp,
    isLoading,
    feedback,
    clearFeedback,
    pendingResetEmail,
    refreshPendingResetEmail,
  } = useAuth();
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : "",
  );
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email: string | null;
    otp: string | null;
    password: string | null;
    confirmPassword: string | null;
  }>({
    email: null,
    otp: null,
    password: null,
    confirmPassword: null,
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    refreshPendingResetEmail().catch(() => undefined);
  }, [refreshPendingResetEmail]);

  async function handleResetPassword() {
    const nextErrors = {
      email: validateAuthEmail(email),
      otp: validateAuthOtp(otp),
      password: validateAuthPassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
    };

    setFieldErrors(nextErrors);
    setFormError(null);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    try {
      await verifyPasswordResetOtp(email, otp, password);
      router.replace("/home" as never);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to update the password.",
      );
    }
  }

  const resolvedEmail = email || pendingResetEmail || "";

  return (
    <AuthShell
      eyebrow="Set a New Password"
      title="Finish the reset"
      description="Confirm the account email, enter the code from your inbox, and choose a new password."
      footer={
        <Link href="/login" asChild>
          <ThemedText type="smallBold" style={styles.footerLink}>
            Return to login
          </ThemedText>
        </Link>
      }
    >
      {feedback ? (
        <AuthBanner
          type={feedback.type}
          title={
            feedback.type === "success" ? "Password updated" : "Reset ready"
          }
          message={feedback.message}
          onDismiss={clearFeedback}
        />
      ) : null}
      {formError ? (
        <AuthBanner type="error" title="Reset failed" message={formError} />
      ) : null}

      <View style={styles.form}>
        <AuthField
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (fieldErrors.email) {
              setFieldErrors((current) => ({ ...current, email: null }));
            }
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          errorMessage={fieldErrors.email}
          helperText={
            resolvedEmail
              ? `Resetting password for ${resolvedEmail}`
              : "Enter the email used to start the reset flow."
          }
        />

        <AuthField
          label="Verification code"
          value={otp}
          onChangeText={(value) => {
            setOtp(value);
            if (fieldErrors.otp) {
              setFieldErrors((current) => ({ ...current, otp: null }));
            }
          }}
          placeholder="6-digit code"
          keyboardType="number-pad"
          autoComplete={'one-time-code' as never}
          textContentType={'oneTimeCode' as never}
          errorMessage={fieldErrors.otp}
          helperText="Enter the one-time code that was emailed to you."
        />

        <AuthField
          label="New password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (fieldErrors.password || fieldErrors.confirmPassword) {
              setFieldErrors((current) => ({
                ...current,
                password: null,
                confirmPassword: null,
              }));
            }
          }}
          placeholder="Create a new password"
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          errorMessage={fieldErrors.password}
          rightAccessory={
            <ThemedText
              type="smallBold"
              onPress={() => setShowPassword((current) => !current)}
              style={styles.inlineAction}
            >
              {showPassword ? "Hide" : "Show"}
            </ThemedText>
          }
        />

        <AuthField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            if (fieldErrors.confirmPassword) {
              setFieldErrors((current) => ({
                ...current,
                confirmPassword: null,
              }));
            }
          }}
          placeholder="Confirm the new password"
          secureTextEntry={!showConfirmPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          errorMessage={fieldErrors.confirmPassword}
          rightAccessory={
            <ThemedText
              type="smallBold"
              onPress={() => setShowConfirmPassword((current) => !current)}
              style={styles.inlineAction}
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </ThemedText>
          }
        />

        <AuthButton
          label="Update password"
          onPress={handleResetPassword}
          loading={isLoading}
        />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  footerLink: {
    color: authTheme.colors.burgundy,
  },
  inlineAction: {
    color: authTheme.colors.burgundy,
  },
});
