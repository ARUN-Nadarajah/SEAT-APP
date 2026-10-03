import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button } from '@/components/ui';
import { markOnboardingSeen } from './index';
import { colors, radius, spacing } from '@/theme';

const { width } = Dimensions.get('window');

/**
 * Onboarding — 3 slides (spec §5), the second explaining how the Virtual
 * Queue works for first-time users (spec §9: make the feature discoverable).
 */
const SLIDES = [
  {
    glyph: '🍽',
    title: 'Find a table, fast',
    body: 'See live availability for every restaurant in Jaffna — how many tables are free and the next available time.',
  },
  {
    glyph: '⏭',
    title: 'What is a virtual queue?',
    body: 'No tables free? Join the queue from home. Your spot is saved, you watch your position move in real time, and we tell you the moment your table is ready. It is a waiting list — not a fixed-time booking.',
  },
  {
    glyph: '🔔',
    title: 'We’ll let you know',
    body: 'Push, email, SMS or WhatsApp — choose how you want to hear about your booking and your table. Change it any time in Profile.',
  },
];

export default function OnboardingScreen() {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);

  async function finish() {
    await markOnboardingSeen();
    router.replace('/(auth)/login');
  }

  function next() {
    if (index >= SLIDES.length - 1) {
      finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function onViewableItemsChanged({ viewableItems }: { viewableItems: ViewToken[] }) {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.title}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.glyph}>
              <AppText style={styles.glyphText}>{item.glyph}</AppText>
            </View>
            <AppText variant="display" style={styles.title}>
              {item.title}
            </AppText>
            <AppText variant="body" style={styles.body}>
              {item.body}
            </AppText>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={[styles.dot, dotIndex === index && styles.dotActive]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Skip" variant="ghost" onPress={finish} accessibilityLabel="Skip onboarding" />
          <Button
            label={index === SLIDES.length - 1 ? 'Get started' : 'Next'}
            onPress={next}
            style={styles.next}
            accessibilityLabel={index === SLIDES.length - 1 ? 'Get started' : 'Next slide'}
          />
        </View>

        <Pressable onPress={finish} accessibilityRole="button" style={styles.loginRow}>
          <AppText variant="secondary">
            Already have an account?{' '}
            <AppText variant="label" style={styles.link}>
              Sign in
            </AppText>
          </AppText>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    gap: spacing.lg,
  },
  glyph: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: colors.infoBox,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  glyphText: { fontSize: 46 },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', color: colors.textSecondary, maxWidth: 340 },
  footer: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    gap: spacing.lg,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: { width: 24, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  next: { flex: 1 },
  loginRow: { alignItems: 'center', paddingVertical: spacing.sm },
  link: { color: colors.primary, textDecorationLine: 'underline' },
});

/** Kept exported for tests. */
export const ONBOARDING_SLIDE_COUNT = SLIDES.length;
export const onboardingRadius = radius.lg;
