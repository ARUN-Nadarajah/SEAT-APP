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
} from "@/features/auth/components/auth-controls";
import {
  validateAuthEmail,
  validateAuthOtp,
  validateAuthName,
  validateAuthPassword,
  validateAuthPhone,
  validateConfirmPassword,
} from "@/features/auth/utils/validation";

export default function RegisterScreen() {
  const {
    requestRegisterOtp,
    verifyRegisterOtp,
    isAuthenticated,
    isLoading,
    feedback,
    clearFeedback,
  } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName: string | null;
    email: string | null;
    phone: string | null;
    password: string | null;
    confirmPassword: string | null;
    otp: string | null;
  }>({
    fullName: null,
    email: null,
    phone: null,
    password: null,
    confirmPassword: null,
    otp: null,
  });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/home" as never);
    }
  }, [isAuthenticated]);

  async function handleRegister() {
    const nextErrors = {
      fullName: validateAuthName(fullName),
      email: validateAuthEmail(email),
      phone: validateAuthPhone(phone),
      password: validateAuthPassword(password),
      confirmPassword: validateConfirmPassword(password, confirmPassword),
      otp: otpRequested ? validateAuthOtp(otp) : null,
    };

    setFieldErrors(nextErrors);
    setFormError(null);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    try {
      if (!otpRequested) {
        await requestRegisterOtp({ fullName, email, phone, password });
        setOtpRequested(true);
        return;
      }

      await verifyRegisterOtp(email, otp);
      router.replace("/home" as never);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to create the account.",
      );
    }
  }

  return (
    <AuthShell
      eyebrow="Create Account"
      title="Reserve with confidence"
      description="Create your customer account, receive a verification code by email, and complete sign up in one flow."
      footer={
        <Link href="/login" asChild>
          <ThemedText type="smallBold" style={styles.footerLink}>
            Already registered? Log in
          </ThemedText>
        </Link>
      }
    >
      {feedback ? (
        <AuthBanner
          type={feedback.type}
          title={feedback.type === "success" ? "Account ready" : "Action ready"}
          message={feedback.message}
          onDismiss={clearFeedback}
        />
      ) : null}
      {formError ? (
        <AuthBanner
          type="error"
          title="Registration failed"
          message={formError}
        />
      ) : null}

      <View style={styles.form}>
        <AuthField
          label="Full name"
          value={fullName}
          onChangeText={(value) => {
            setFullName(value);
            if (fieldErrors.fullName) {
              setFieldErrors((current) => ({ ...current, fullName: null }));
            }
          }}
          placeholder="Your full name"
          autoComplete="name"
          textContentType="name"
          errorMessage={fieldErrors.fullName}
        />

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
        />

        <AuthField
          label="Phone"
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            if (fieldErrors.phone) {
              setFieldErrors((current) => ({ ...current, phone: null }));
            }
          }}
          placeholder="+1 555 000 0000"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          errorMessage={fieldErrors.phone}
        />

        <AuthField
          label="Password"
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
          placeholder="Create a password"
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
          label="Confirm password"
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
          placeholder="Confirm your password"
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

        {otpRequested ? (
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
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            errorMessage={fieldErrors.otp}
            helperText="Enter the code sent to your email address to complete registration."
          />
        ) : null}

        <AuthButton
          label={otpRequested ? "Create account" : "Send code"}
          onPress={handleRegister}
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
