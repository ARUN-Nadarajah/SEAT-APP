import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ReactNode,
} from "react-native";

import { ThemedText } from "@/components/themed-text";

import { authTheme } from "../auth-theme";

type AuthFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  errorMessage?: string | null;
  helperText?: string;
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  secureTextEntry?: boolean;
  autoComplete?:
    | "email"
    | "name"
    | "password"
    | "tel"
    | "off"
    | "username"
    | "new-password";
  textContentType?:
    | "name"
    | "emailAddress"
    | "password"
    | "telephoneNumber"
    | "newPassword"
    | "none";
  rightAccessory?: ReactNode;
};

export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  errorMessage,
  helperText,
  keyboardType = "default",
  autoCapitalize = "none",
  secureTextEntry = false,
  autoComplete,
  textContentType,
  rightAccessory,
}: AuthFieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
      <View
        style={[styles.inputRow, errorMessage ? styles.inputRowError : null]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={authTheme.colors.textMuted}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          autoComplete={autoComplete}
          textContentType={textContentType}
          style={styles.input}
        />
        {rightAccessory ? (
          <View style={styles.accessory}>{rightAccessory}</View>
        ) : null}
      </View>
      {errorMessage ? (
        <ThemedText type="small" style={styles.errorText}>
          {errorMessage}
        </ThemedText>
      ) : null}
      {helperText ? (
        <ThemedText type="small" style={styles.helperText}>
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

type AuthButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

export function AuthButton({
  label,
  onPress,
  loading = false,
  variant = "primary",
}: AuthButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "ghost" && styles.ghostButton,
        loading && styles.buttonDisabled,
        pressed && !loading ? styles.buttonPressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "primary"
              ? authTheme.colors.ivory
              : authTheme.colors.burgundy
          }
        />
      ) : (
        <ThemedText
          type="smallBold"
          style={[
            styles.buttonText,
            variant === "primary" && styles.primaryButtonText,
            variant === "secondary" && styles.secondaryButtonText,
            variant === "ghost" && styles.ghostButtonText,
          ]}
        >
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

type AuthPillProps = {
  label: string;
};

export function AuthPill({ label }: AuthPillProps) {
  return (
    <View style={styles.pill}>
      <ThemedText type="smallBold" style={styles.pillText}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: authTheme.colors.text,
  },
  inputRow: {
    minHeight: 56,
    borderRadius: authTheme.radius.medium,
    borderWidth: 1,
    borderColor: authTheme.colors.border,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    gap: 10,
  },
  inputRowError: {
    borderColor: authTheme.colors.error,
  },
  input: {
    flex: 1,
    color: authTheme.colors.text,
    fontSize: 16,
    paddingVertical: 14,
  },
  accessory: {
    justifyContent: "center",
  },
  helperText: {
    color: authTheme.colors.textMuted,
  },
  errorText: {
    color: authTheme.colors.error,
  },
  button: {
    minHeight: 56,
    borderRadius: authTheme.radius.medium,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryButton: {
    backgroundColor: authTheme.colors.burgundy,
    shadowColor: authTheme.shadow.color,
    shadowOpacity: authTheme.shadow.opacity,
    shadowRadius: authTheme.shadow.radius,
    shadowOffset: authTheme.shadow.offset,
    elevation: 3,
  },
  secondaryButton: {
    backgroundColor: authTheme.colors.cream,
  },
  ghostButton: {
    backgroundColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    fontSize: 15,
  },
  primaryButtonText: {
    color: authTheme.colors.ivory,
  },
  secondaryButtonText: {
    color: authTheme.colors.burgundy,
  },
  ghostButtonText: {
    color: authTheme.colors.burgundy,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(107, 30, 46, 0.07)",
  },
  pillText: {
    color: authTheme.colors.burgundy,
  },
});
