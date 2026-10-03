import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { AppText } from './Text';
import { colors, radius, spacing } from '@/theme';

/**
 * Loading / empty / error states (NFR05: "loading states and skeleton
 * screens on all data screens … error and empty states everywhere").
 */

/** Shimmering placeholder block. Wrap several for a skeleton list. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius: corner = radius.sm,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: object;
}) {
  // Lazy state (not a ref) so the animated value is created once, outside
  // of render — the React compiler requires refs to stay out of render.
  const [opacity] = useState(() => new Animated.Value(0.45));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height, width, borderRadius: corner, backgroundColor: colors.skeleton },
        { opacity },
        style,
      ]}
    />
  );
}

/** Skeleton for the Explore list (FR01 card layout). */
export function RestaurantCardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Loading restaurant">
      <Skeleton height={150} radius={radius.lg} />
      <Skeleton height={18} width="65%" />
      <Skeleton height={14} width="45%" />
      <Skeleton height={34} width="85%" radius={radius.pill} />
    </View>
  );
}

/** Skeleton for list screens (bookings, queue, notifications). */
export function RowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.row}>
          <Skeleton height={56} width={56} radius={radius.md} />
          <View style={styles.rowBody}>
            <Skeleton height={16} width="70%" />
            <Skeleton height={13} width="45%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Friendly empty state with an optional action (spec §9). */
export function EmptyState({
  title,
  message,
  action,
  glyph = '🍽',
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  glyph?: string;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.glyph}>
        <AppText style={styles.glyphText}>{glyph}</AppText>
      </View>
      <AppText variant="heading" style={styles.stateTitle}>
        {title}
      </AppText>
      <AppText variant="secondary" style={styles.stateMessage}>
        {message}
      </AppText>
      {action}
    </View>
  );
}

/** Error state with a retry affordance. */
export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.state}>
      <View style={[styles.glyph, styles.errorGlyph]}>
        <AppText style={styles.glyphText}>!</AppText>
      </View>
      <AppText variant="heading" style={styles.stateTitle}>
        We couldn’t load that
      </AppText>
      <AppText variant="secondary" style={styles.stateMessage}>
        {message}
      </AppText>
      {onRetry ? (
        <AppText
          variant="label"
          onPress={onRetry}
          accessibilityRole="button"
          style={styles.retry}
        >
          Tap to try again
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, paddingVertical: spacing.sm },
  list: { gap: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowBody: { flex: 1, gap: spacing.sm },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing.xl,
  },
  glyph: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.infoBox,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  errorGlyph: { backgroundColor: '#FBE9E7' },
  glyphText: { fontSize: 30, color: colors.primary },
  stateTitle: { textAlign: 'center' },
  stateMessage: { textAlign: 'center', maxWidth: 320 },
  retry: { color: colors.primary, marginTop: spacing.sm, textDecorationLine: 'underline' },
});
