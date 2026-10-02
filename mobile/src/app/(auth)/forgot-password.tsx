import { Link, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/features/auth/auth-context";
import { authTheme } from "@/features/auth/auth-theme";
import { AuthBanner, AuthShell } from "@/features/auth/components/auth-shell";
import {
  AuthButton,
  AuthField,
} from "@/features/auth/components/auth-controls";
import { validateAuthEmail } from "@/features/auth/utils/validation";

export default function ForgotPasswordScreen() {
  const { requestPasswordResetOtp, isLoading, feedback, clearFeedback } =
    useAuth();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSendReset() {
    const nextEmailError = validateAuthEmail(email);
    setEmailError(nextEmailError);
    setFormError(null);

    if (nextEmailError) {
      return;
    }

    try {
      await requestPasswordResetOtp(email);
      router.push({ pathname: "/reset-password" as never, params: { email } });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to start the reset flow.",
      );
    }
  }

  return (
    <AuthShell
      eyebrow="Password Help"
      title="Reset access"
      description="Enter the email linked to your account and receive a one-time code for password recovery."
      footer={
        <Link href="/login" asChild>
          <ThemedText type="smallBold" style={styles.footerLink}>
            Back to login
          </ThemedText>
        </Link>
      }
    >
      {feedback?.type === "warning" ? (
        <AuthBanner
          type="warning"
          title="Reset prepared"
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
            if (emailError) {
              setEmailError(null);
            }
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          errorMessage={emailError}
          helperText="We will use this address to validate the reset request."
        />

        <AuthButton
          label="Continue"
          onPress={handleSendReset}
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
});
