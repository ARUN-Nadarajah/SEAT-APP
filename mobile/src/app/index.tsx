import { Redirect } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/features/auth/auth-context";
import { authTheme } from "@/features/auth/auth-theme";

export default function SplashScreen() {
  const { isHydrating, isAuthenticated } = useAuth();

  if (!isHydrating) {
    return <Redirect href={(isAuthenticated ? "/home" : "/login") as never} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <View style={styles.content}>
        <View style={styles.brandMark}>
          <ThemedText type="smallBold" style={styles.brandMarkText}>
            S
          </ThemedText>
        </View>
        <ThemedText type="title" style={styles.title}>
          Seat
        </ThemedText>
        <ThemedText type="default" style={styles.subtitle}>
          Elegant dining, reserved with clarity.
        </ThemedText>
        <View style={styles.loadingRow}>
          <ActivityIndicator color={authTheme.colors.burgundy} />
          <ThemedText type="small" style={styles.loadingText}>
            Authenticating your session
          </ThemedText>
        </View>
        <Pressable style={styles.footerPill}>
          <ThemedText type="smallBold" style={styles.footerText}>
            Premium restaurant experience
          </ThemedText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: authTheme.colors.ivory,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 28,
    backgroundColor: authTheme.colors.surface,
    shadowColor: authTheme.colors.burgundy,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  glowTop: {
    position: "absolute",
    top: 90,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(107, 30, 46, 0.08)",
  },
  glowBottom: {
    position: "absolute",
    bottom: 90,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 200,
    backgroundColor: "rgba(217, 154, 43, 0.12)",
  },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: authTheme.colors.burgundy,
  },
  brandMarkText: {
    color: authTheme.colors.ivory,
    fontSize: 24,
  },
  title: {
    color: authTheme.colors.burgundy,
    textAlign: "center",
    fontSize: 44,
    lineHeight: 48,
  },
  subtitle: {
    color: authTheme.colors.textMuted,
    textAlign: "center",
    maxWidth: 300,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 4,
  },
  loadingText: {
    color: authTheme.colors.textMuted,
  },
  footerPill: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: authTheme.colors.cream,
    borderWidth: 1,
    borderColor: "rgba(107, 30, 46, 0.08)",
  },
  footerText: {
    color: authTheme.colors.burgundy,
    letterSpacing: 0.4,
  },
});
