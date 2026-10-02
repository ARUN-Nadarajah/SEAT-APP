import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/features/auth/auth-context";
import { authTheme } from "@/features/auth/auth-theme";
import { AuthBanner, AuthShell } from "@/features/auth/components/auth-shell";
import {
  AuthButton,
  AuthField,
  AuthPill,
} from "@/features/auth/components/auth-controls";
import {
  validateAuthEmail,
  validateAuthPassword,
} from "@/features/auth/utils/validation";

export default function LoginScreen() {
  const { login, isAuthenticated, isLoading, feedback, clearFeedback } =
    useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/home" as never);
    }
  }, [isAuthenticated]);

  async function handleLogin() {
    const nextEmailError = validateAuthEmail(email);
    const nextPasswordError = validateAuthPassword(password);

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    try {
      await login(email, password);
      router.replace("/home" as never);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Unable to sign in right now.",
      );
    }
  }

  return (
    <AuthShell
      eyebrow="Customer Access"
      title="Welcome back"
      description="Sign in with your email and password to continue to your customer dashboard."
      footer={
        <Link href="/register" asChild>
          <ThemedText type="smallBold" style={styles.footerLink}>
            New here? Create an account
          </ThemedText>
        </Link>
      }
    >
      {feedback ? (
        <AuthBanner
          type={feedback.type}
          title={feedback.type === "success" ? "Signed in" : "Action ready"}
          message={feedback.message}
          onDismiss={clearFeedback}
        />
      ) : null}
      {formError ? (
        <AuthBanner type="error" title="Sign in failed" message={formError} />
      ) : null}

      <AuthPill label="Direct sign-in with email and password" />

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
        />

        <AuthField
          label="Password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) {
              setPasswordError(null);
            }
          }}
          placeholder="Your password"
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          errorMessage={passwordError}
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

        <Link href="/forgot-password" asChild>
          <ThemedText type="smallBold" style={styles.forgotLink}>
            Forgot password?
          </ThemedText>
        </Link>

        <AuthButton label="Log in" onPress={handleLogin} loading={isLoading} />
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
  forgotLink: {
    color: authTheme.colors.amber,
    alignSelf: "flex-end",
  },
  inlineAction: {
    color: authTheme.colors.burgundy,
  },
});
