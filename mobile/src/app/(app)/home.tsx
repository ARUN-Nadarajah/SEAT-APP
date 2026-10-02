import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/features/auth/auth-context";
import { authTheme } from "@/features/auth/auth-theme";
import { AuthBanner, AuthShell } from "@/features/auth/components/auth-shell";
import { AuthButton, AuthPill } from "@/features/auth/components/auth-controls";

export default function HomeScreen() {
  const { user, feedback, clearFeedback, logout, isLoading } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/login" as never);
  }

  return (
    <AuthShell
      eyebrow="Customer Home"
      title={`Welcome${user ? `, ${user.name.split(" ")[0]}` : ""}`}
      description="Your authentication flow is active. The rest of the customer journey can now build on this guarded shell."
      footer={<AuthPill label="Authentication complete" />}
    >
      {feedback ? (
        <AuthBanner
          type={feedback.type}
          title={feedback.type === "success" ? "Ready" : "Notice"}
          message={feedback.message}
          onDismiss={clearFeedback}
        />
      ) : null}

      <View style={styles.cardCopy}>
        <ThemedText type="smallBold" style={styles.label}>
          Signed in as
        </ThemedText>
        <ThemedText type="default" style={styles.value}>
          {user?.email ?? "customer@example.com"}
        </ThemedText>
        <ThemedText type="small" style={styles.subtle}>
          Local mock authentication is wired and ready for a real backend
          integration later.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <AuthButton
          label="Log out"
          onPress={handleLogout}
          loading={isLoading}
          variant="secondary"
        />
        <Pressable onPress={() => router.push("/login" as never)}>
          <ThemedText type="smallBold" style={styles.link}>
            Go back to login
          </ThemedText>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  cardCopy: {
    gap: 8,
  },
  label: {
    color: authTheme.colors.burgundy,
  },
  value: {
    color: authTheme.colors.text,
  },
  subtle: {
    color: authTheme.colors.textMuted,
  },
  actions: {
    gap: 12,
  },
  link: {
    color: authTheme.colors.amber,
    textAlign: "center",
  },
});
