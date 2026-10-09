import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  InfoBox,
  LastUpdated,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchRestaurant } from '@/services/api';
import { colors, radius, shadow, spacing } from '@/theme';
import { setPendingQueueRestaurant } from '@/services/queue-navigation';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';

/**
 * Restaurant Details (spec §5 + FR03).
 *
 * Contains ONE combined action area: the primary "Reserve a table" and a
 * deliberately conspicuous secondary "Join the queue" button — the brief
 * calls the discoverability of virtual queue the key usability finding.
 */
export default function RestaurantDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = id || EXPLORE_RESTAURANT_ID;
  const [showQueueHelp, setShowQueueHelp] = useState(false);

  const query = useApiQuery(
    ['restaurant', restaurantId],
    () => fetchRestaurant(restaurantId, { partySize: 2 }),
    { enabled: Boolean(restaurantId) },
  );

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={styles.loading}>
          <Skeleton height={220} radius={radius.lg} />
          <Skeleton height={24} width="70%" />
          <Skeleton height={16} width="50%" />
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ErrorState
          message={apiErrorMessage(query.error)}
          onRetry={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const restaurant = query.data.data;
  const availability = restaurant.availability;
  const waitLabel = availability.walkInWait.label;
  const fullyBooked = availability.status === 'fully-booked';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        {restaurant.image ? (
          <Image source={{ uri: restaurant.image }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroFallback]}>
            <Ionicons name="restaurant" size={40} color={colors.primary} />
          </View>
        )}

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <AppText variant="title" style={styles.name}>
              {restaurant.name}
            </AppText>
            <View style={styles.rating}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <AppText variant="label">{restaurant.rating.toFixed(1)}</AppText>
            </View>
          </View>
          <AppText variant="secondary">
            {restaurant.cuisine} · {restaurant.priceRange} ·{' '}
            {restaurant.reviewCount} reviews
          </AppText>

          {/* Chips: open-until + parking (spec §5) */}
          <View style={styles.chips}>
            <Badge label={restaurant.openHoursLabel} tone="neutral" />
            <Badge
              label={restaurant.parkingLabel}
              tone={restaurant.parking ? 'success' : 'neutral'}
            />
            <Badge label={`${restaurant.availableTables} tables free`} tone="success" />
          </View>
        </View>

        {/* Your table / Wait info cards */}
        <View style={styles.infoRow}>
          <Card style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <AppText variant="label">Your table</AppText>
            <AppText variant="secondary">
              {availability.firstSlot
                ? `From ${availability.firstSlot.label} today`
                : 'No slots left today'}
            </AppText>
            <AppText variant="caption">
              {availability.availableSlots} time slots available
            </AppText>
          </Card>

          <Card style={styles.infoCard}>
            <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
            <AppText variant="label">Walk-in wait</AppText>
            <AppText variant="secondary">{waitLabel} estimated</AppText>
            <AppText variant="caption">
              {availability.queueLength} parties in the queue
            </AppText>
          </Card>
        </View>

        <LastUpdated timestamp={query.data.lastUpdated} live />

        <AppText variant="body">{restaurant.description}</AppText>

        {/* Supporting destinations */}
        <View style={styles.linkRow}>
          <Pressable
            style={styles.linkCard}
            onPress={() => router.push('/restaurant/menu')}
            accessibilityRole="button"
            accessibilityLabel="Explore the menu"
          >
            <Ionicons name="book-outline" size={18} color={colors.primary} />
            <AppText variant="label">Explore the menu</AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>

          <Pressable
            style={styles.linkCard}
            onPress={() =>
              router.push({
                pathname: '/restaurant/[id]/location',
                params: { id: restaurant.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Plan your arrival"
          >
            <Ionicons name="map-outline" size={18} color={colors.primary} />
            <AppText variant="label">Plan your arrival</AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* --- ONE combined action area (spec §5) --- */}
        <View style={styles.actions}>
          <Button
            label="Reserve a table"
            onPress={() =>
              router.push({
                pathname: '/reserve',
                params: { restaurantId: restaurant.id },
              })
            }
            accessibilityLabel="Reserve a table"
            testID="reserve-cta"
          />

          {/* Secondary queue action — high contrast so it is never missed. */}
          <Pressable
            onPress={() => {
              setPendingQueueRestaurant(restaurant.id);
              router.push('/queue/join');
            }}
            style={styles.queueButton}
            accessibilityRole="button"
            accessibilityLabel={`Join the queue, ${waitLabel} estimated wait`}
            testID="join-queue-cta"
          >
            <View style={styles.queueButtonInner}>
              <Ionicons name="people-outline" size={20} color={colors.primary} />
              <View style={styles.queueButtonText}>
                <AppText variant="label" style={styles.queueButtonTitle}>
                  Takeaway · join queue
                </AppText>
                <AppText variant="caption">
                  {fullyBooked
                    ? 'Every table is taken — wait from home'
                    : `${availability.queueLength} orders in the queue right now`}
                </AppText>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </View>
          </Pressable>

          {/* First-time explainer (spec §9) */}
          <Pressable
            onPress={() => setShowQueueHelp((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showQueueHelp }}
            accessibilityLabel="What is a virtual queue?"
            style={styles.helpToggle}
          >
            <Ionicons
              name={showQueueHelp ? 'chevron-up' : 'help-circle-outline'}
              size={18}
              color={colors.primary}
            />
            <AppText variant="label" style={styles.helpLabel}>
              What is a virtual queue?
            </AppText>
          </Pressable>

          {showQueueHelp ? (
            <InfoBox tone="info">
              <AppText variant="secondary">
                Join a takeaway queue from anywhere, track your parcel live, and
                collect it when it is ready. Want to dine in? Reserve a table
                instead.
              </AppText>
            </InfoBox>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.back}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="label">Restaurant</AppText>
      <View style={styles.back} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  hero: { width: '100%', height: 210, borderRadius: radius.lg, backgroundColor: colors.skeleton },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },
  titleBlock: { gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  infoRow: { flexDirection: 'row', gap: spacing.md },
  infoCard: { flex: 1, gap: spacing.xs },
  linkRow: { gap: spacing.sm },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 56,
  },
  actions: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
    ...shadow.card,
  },
  queueButton: {
    minHeight: 60,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.infoBox,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  queueButtonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  queueButtonText: { flex: 1, gap: 2 },
  queueButtonTitle: { fontSize: 15, color: colors.primary },
  helpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  helpLabel: { color: colors.primary, textDecorationLine: 'underline' },
});
