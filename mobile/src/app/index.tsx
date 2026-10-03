import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { colors, spacing } from '@/theme';

const ONBOARDING_KEY = 'seat-app.onboarding.seen.v1';

/** Where each role lands after signing in (spec §2: role-based navigation). */
export function homePathForRole(role?: string | null): string {
  if (role === 'staff') return '/(staff)';
  if (role === 'manager') return '/(manager)';
  return '/(tabs)/explore';
}

/** Marks onboarding as seen — called by the onboarding screen's actions. */
export async function markOnboardingSeen() {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* non-fatal: worst case the user sees onboarding again */
  }
}

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return Boolean(await AsyncStorage.getItem(ONBOARDING_KEY));
  } catch {
    return true;
  }
}

/**
 * Splash + bootstrap (spec §5).
 *
 * Shows the brand while we hydrate the session and check whether the 3-slide
 * onboarding has been seen, then routes to the right place.
 */
export default function SplashScreen() {
  const { isHydrating, isAuthenticated, user } = useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    hasSeenOnboarding().then((value) => {
      if (mounted) setSeen(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (isHydrating || seen === null) {
    return <SplashView />;
  }

  if (!seen) {
    return <Redirect href="/onboarding" />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href={homePathForRole(user?.role) as never} />;
}

function SplashView() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <AppText style={styles.markGlyph}>S</AppText>
        </View>
        <AppText variant="display" style={styles.title}>
          SEAT
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          Reserve a table. Skip the wait.
        </AppText>
      </View>
      <ActivityIndicator color={colors.primary} style={styles.spinner} />
      <AppText variant="caption" style={styles.loading}>
        Getting your table ready…
      </AppText>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markGlyph: { fontSize: 40, color: colors.accent, fontFamily: 'Fraunces_600SemiBold' },
  title: { letterSpacing: 4 },
  subtitle: { textAlign: 'center' },
  spinner: { marginTop: spacing.xl },
  loading: { color: colors.textMuted },
});
