import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AnimatedText } from '@/components/AnimatedText';
import { AppText } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { colors, fonts, spacing } from '@/theme';

const ONBOARDING_KEY = 'seat-app.onboarding.seen.v1';

const FOOD_IMAGE =
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1000&q=80';

/** Headline is split across two lines; line 2 starts once line 1 finishes. */
const LINE_1 = 'Good food.';
const LINE_2 = 'Less waiting.';

/**
 * One-shot intro timeline (ms) — logo → headline letters → photo → pill →
 * supporting copy → buttons, then a gentle float. ~3s in total.
 */
const LETTER_STAGGER_MS = 40;
const HEADLINE_START_MS = 400;
const HEADLINE_DONE_MS = HEADLINE_START_MS + LINE_1.length * LETTER_STAGGER_MS + 640;
const INTRO_DONE_MS = 2600;
const FLOAT_START_MS = 3000;

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
 * Launch screen (spec §5).
 *
 * A one-shot, ordered intro: wordmark → headline letters → food photo →
 * pill → supporting copy → buttons, then a subtle float on the photo.
 * Reduce-motion skips straight to the finished layout, and both buttons
 * are live.
 */
export default function LaunchScreen() {
  const { isAuthenticated, user } = useAuth();
  const [reduceMotion, setReduceMotion] = useState(false);

  // Respect the system "reduce motion" setting (spec §9).
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  async function onFindTable() {
    await markOnboardingSeen();
    // Guests land on Explore too — the tabs layout bounces them to sign-in.
    router.replace(homePathForRole(isAuthenticated ? user?.role : null) as never);
  }

  function onRestaurantTeam() {
    router.push('/(auth)/login');
  }

  return (
    <SafeAreaView style={styles.root}>
      <AnimatedLogo enabled={!reduceMotion} />
      <AnimatedPhoto enabled={!reduceMotion} />
      <AnimatedSupportingCopy enabled={!reduceMotion} />
      <View style={styles.spacer} />
      <AnimatedActions
        enabled={!reduceMotion}
        onFindTable={onFindTable}
        onRestaurantTeam={onRestaurantTeam}
      />
    </SafeAreaView>
  );
}

/** 1. Wordmark fades in and slides down slightly. */
function AnimatedLogo({ enabled }: { enabled: boolean }) {
  const progress = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) return;
    progress.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [enabled, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (progress.value - 1) * 16 }],
  }));

  return (
    <Animated.View style={[styles.logoWrap, style]}>
      <AppText style={styles.logo}>SEAT</AppText>
    </Animated.View>
  );
}

/** 3. Photo scales/fades/rises, then the pill springs, then a subtle float. */
function AnimatedPhoto({ enabled }: { enabled: boolean }) {
  const progress = useSharedValue(enabled ? 0 : 1);
  const pill = useSharedValue(enabled ? 0 : 1);
  const float = useSharedValue(0);

  useEffect(() => {
    if (!enabled) return;

    // The photo lands only after every headline letter has appeared.
    progress.value = withDelay(
      HEADLINE_DONE_MS,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
    pill.value = withDelay(
      HEADLINE_DONE_MS + 700,
      withSpring(1, { damping: 12, stiffness: 180 }),
    );
    // Very gentle continuous float once the intro has settled (~6px, 4s/cycle).
    float.value = withDelay(
      FLOAT_START_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [enabled, float, pill, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 24 + float.value * -6 },
      { scale: 0.9 + progress.value * 0.1 },
    ],
  }));

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pill.value,
    transform: [{ scale: pill.value }],
  }));

  return (
    <Animated.View style={[styles.photoShell, style]}>
      <Image
        source={{ uri: FOOD_IMAGE }}
        style={styles.photo}
        resizeMode="cover"
        accessibilityLabel="A table of shared dishes"
      />
      <Animated.View style={[styles.pill, pillStyle]}>
        <AppText style={styles.pillText}>YOUR EVENING, RECLAIMED</AppText>
      </Animated.View>
    </Animated.View>
  );
}

/** 2. Headline letters, then 4. the supporting label + subtitle. */
function AnimatedSupportingCopy({ enabled }: { enabled: boolean }) {
  const label = useSharedValue(enabled ? 0 : 1);
  const subtitle = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) return;
    label.value = withDelay(
      INTRO_DONE_MS - 500,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
    subtitle.value = withDelay(
      INTRO_DONE_MS - 350,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
  }, [enabled, label, subtitle]);

  const labelStyle = useAnimatedStyle(() => ({ opacity: label.value }));
  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitle.value,
    transform: [{ translateY: (1 - subtitle.value) * 8 }],
  }));

  // Line 2 waits for every letter of line 1 to have landed.
  const line2Delay = HEADLINE_START_MS + LINE_1.length * LETTER_STAGGER_MS;

  return (
    <View style={styles.copy}>
      <Animated.View style={labelStyle}>
        <AppText style={styles.eyebrow}>DINING, AT YOUR PACE</AppText>
      </Animated.View>

      <View style={styles.headline}>
        <AnimatedText
          text={LINE_1}
          enabled={enabled}
          delayMs={HEADLINE_START_MS}
          staggerMs={LETTER_STAGGER_MS}
          style={styles.headlineLine}
        />
        <AnimatedText
          text={LINE_2}
          enabled={enabled}
          delayMs={line2Delay}
          staggerMs={LETTER_STAGGER_MS}
          style={styles.headlineLine}
        />
      </View>

      <Animated.View style={subtitleStyle}>
        <AppText style={styles.subtitle}>
          Book a table or join the queue before you leave home.
        </AppText>
      </Animated.View>
    </View>
  );
}

/** 5. Buttons slide up from the bottom, 150ms apart. */
function AnimatedActions({
  enabled,
  onFindTable,
  onRestaurantTeam,
}: {
  enabled: boolean;
  onFindTable: () => void;
  onRestaurantTeam: () => void;
}) {
  const primary = useSharedValue(enabled ? 0 : 1);
  const secondary = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) return;
    primary.value = withDelay(
      INTRO_DONE_MS - 200,
      withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }),
    );
    secondary.value = withDelay(
      INTRO_DONE_MS - 50,
      withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }),
    );
  }, [enabled, primary, secondary]);

  const primaryStyle = useAnimatedStyle(() => ({
    opacity: primary.value,
    transform: [{ translateY: (1 - primary.value) * 32 }],
  }));
  const secondaryStyle = useAnimatedStyle(() => ({
    opacity: secondary.value,
    transform: [{ translateY: (1 - secondary.value) * 32 }],
  }));

  return (
    <View style={styles.actions}>
      <Animated.View style={primaryStyle}>
        <PrimaryButton label="Find a table" onPress={onFindTable} />
      </Animated.View>
      <Animated.View style={secondaryStyle}>
        <Pressable
          onPress={onRestaurantTeam}
          accessibilityRole="button"
          accessibilityLabel="Restaurant team"
          testID="launch-restaurant-team"
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.pressed,
          ]}
        >
          <AppText style={styles.buttonSecondaryText}>Restaurant team</AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Primary CTA: press scale + highlight, then navigate. */
function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useSharedValue(1);
  const highlight = useSharedValue(0);

  function pressIn() {
    scale.value = withTiming(0.97, { duration: 100, easing: Easing.out(Easing.quad) });
    highlight.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
  }

  function pressOut() {
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
    highlight.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.quad) });
  }

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: highlight.value * 0.35,
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="launch-find-table"
        style={({ pressed }) => [
          styles.button,
          styles.buttonPrimary,
          pressed && styles.pressed,
        ]}
      >
        <Animated.View style={[styles.highlight, overlayStyle]} />
        <View style={styles.buttonInner}>
          <Ionicons name="search" size={18} color={colors.textPrimary} />
          <AppText style={styles.buttonPrimaryText}>{label}</AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  logoWrap: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  logo: {
    fontFamily: fonts.sansBold,
    fontSize: 26,
    letterSpacing: 2,
    color: colors.textOnPrimary,
  },
  photoShell: {
    height: 272,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: colors.primaryMuted,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  pill: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textPrimary,
  },
  copy: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.accent,
  },
  headline: {
    marginTop: spacing.xs,
    gap: 2,
  },
  headlineLine: {
    fontFamily: fonts.serifSemiBold,
    fontSize: 42,
    lineHeight: 50,
    color: colors.textOnPrimary,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(255,255,255,0.72)',
  },
  spacer: {
    flex: 1,
    minHeight: spacing.xl,
  },
  actions: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  button: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonPrimaryText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  buttonSecondary: {
    backgroundColor: colors.primaryMuted,
  },
  buttonSecondaryText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 16,
    color: colors.textOnPrimary,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  highlight: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
    pointerEvents: 'none',
  },
  pressed: {
    opacity: 0.9,
  },
});
