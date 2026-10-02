import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";

import { authTheme } from "../auth-theme";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.shell}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <ThemedText type="smallBold" style={styles.brandMarkText}>
                  S
                </ThemedText>
              </View>
              <View style={styles.brandCopy}>
                <ThemedText type="smallBold" style={styles.eyebrow}>
                  {eyebrow}
                </ThemedText>
                <ThemedText type="small" style={styles.brandSubtext}>
                  Private dining, simplified
                </ThemedText>
              </View>
            </View>

            <View style={styles.headerBlock}>
              <ThemedText type="title" style={styles.title}>
                {title}
              </ThemedText>
              <ThemedText type="default" style={styles.description}>
                {description}
              </ThemedText>
            </View>

            <View style={styles.card}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type BannerProps = {
  type: "success" | "warning" | "error";
  title: string;
  message: string;
  onDismiss?: () => void;
};

export function AuthBanner({ type, title, message, onDismiss }: BannerProps) {
  return (
    <View
      style={[
        styles.banner,
        type === "success" && styles.bannerSuccess,
        type === "warning" && styles.bannerWarning,
        type === "error" && styles.bannerError,
      ]}
    >
      <View style={styles.bannerTextBlock}>
        <ThemedText type="smallBold" style={styles.bannerTitle}>
          {title}
        </ThemedText>
        <ThemedText type="small" style={styles.bannerMessage}>
          {message}
        </ThemedText>
      </View>
      {onDismiss ? (
        <Pressable onPress={onDismiss} style={styles.bannerDismiss}>
          <ThemedText type="smallBold" style={styles.bannerDismissText}>
            Dismiss
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: authTheme.colors.ivory,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  shell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: 18,
  },
  backgroundTop: {
    position: "absolute",
    top: 80,
    left: -56,
    width: 200,
    height: 200,
    borderRadius: 200,
    backgroundColor: "rgba(107, 30, 46, 0.08)",
  },
  backgroundBottom: {
    position: "absolute",
    bottom: 60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: "rgba(217, 154, 43, 0.11)",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: authTheme.colors.burgundy,
    shadowColor: authTheme.shadow.color,
    shadowOpacity: authTheme.shadow.opacity,
    shadowRadius: authTheme.shadow.radius,
    shadowOffset: authTheme.shadow.offset,
    elevation: 3,
  },
  brandMarkText: {
    color: authTheme.colors.ivory,
    fontSize: 22,
  },
  brandCopy: {
    gap: 2,
  },
  eyebrow: {
    color: authTheme.colors.burgundy,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  brandSubtext: {
    color: authTheme.colors.textMuted,
  },
  headerBlock: {
    gap: 10,
    paddingTop: 8,
  },
  title: {
    color: authTheme.colors.text,
    fontSize: 38,
    lineHeight: 42,
  },
  description: {
    color: authTheme.colors.textMuted,
    maxWidth: 470,
  },
  card: {
    backgroundColor: authTheme.colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: authTheme.colors.border,
    shadowColor: authTheme.shadow.color,
    shadowOpacity: authTheme.shadow.opacity,
    shadowRadius: authTheme.shadow.radius,
    shadowOffset: authTheme.shadow.offset,
    elevation: 4,
    gap: 14,
  },
  footer: {
    alignItems: "center",
  },
  banner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bannerSuccess: {
    backgroundColor: "rgba(47, 125, 50, 0.08)",
    borderColor: "rgba(47, 125, 50, 0.20)",
  },
  bannerWarning: {
    backgroundColor: "rgba(201, 120, 29, 0.10)",
    borderColor: "rgba(201, 120, 29, 0.22)",
  },
  bannerError: {
    backgroundColor: "rgba(180, 35, 24, 0.10)",
    borderColor: "rgba(180, 35, 24, 0.22)",
  },
  bannerTextBlock: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    color: authTheme.colors.text,
  },
  bannerMessage: {
    color: authTheme.colors.textMuted,
  },
  bannerDismiss: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bannerDismissText: {
    color: authTheme.colors.burgundy,
  },
});
