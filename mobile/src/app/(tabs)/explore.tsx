import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LastUpdated,
  LiveDot,
  relativeLabel,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchMyQueue,
  fetchNotifications,
  fetchRestaurants,
  fetchTables,
  type Table,
} from '@/services/api';
import { onQueueUpdated, onTableUpdated } from '@/services/realtime/socket';
import { setPendingQueueRestaurant } from '@/services/queue-navigation';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';
import { colors, radius, shadow, spacing } from '@/theme';

type AvailabilityFilter = 'all' | 'available' | 'reserved';
type GuestFilter = 'all' | '2' | '4' | '6+';

const LOCATION_IMAGES: Record<string, string> = {
  Courtyard: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75',
  Front: 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=75',
  'Window Side': 'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=75',
  Mezzanine: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=75',
  Bar: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?auto=format&fit=crop&w=800&q=75',
  Private: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=75',
  Outdoor: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75',
  Indoor: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=75',
};

const DEFAULT_TABLE_IMAGE = 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=75';

/** "How it works" steps behind the info icon on the virtual queue card. */
const HOW_IT_WORKS_STEPS: { title: string; description: string }[] = [
  {
    title: 'Join the queue',
    description: 'Join the takeaway queue from your phone.',
  },
  {
    title: 'We prepare your order',
    description: 'Track your parcel as it moves through preparation.',
  },
  {
    title: 'Collect it when it is ready',
    description: 'We tell you the moment your parcel is ready to collect.',
  },
];

function getTableImage(table: Table): string {
  if (table.image) return table.image;
  if (table.location && LOCATION_IMAGES[table.location]) {
    return LOCATION_IMAGES[table.location];
  }
  return DEFAULT_TABLE_IMAGE;
}

export function formatTableLabel(raw?: string): string {
  if (!raw) return 'Table';
  if (raw.toLowerCase().startsWith('table')) return raw;
  const num = raw.replace(/^T0*/i, '');
  if (/^\d+$/.test(num)) {
    return `Table ${num.padStart(2, '0')}`;
  }
  return `Table ${raw}`;
}

/**
 * Explore Screen — Table Selection (Choose Your Table)
 *
 * Focuses primarily on restaurant tables available for reservation.
 * Displays tables as clear, attractive cards with immediate visibility of
 * Table Number, Capacity, Location/Type, Availability, and Select Table action.
 */
export default function ExploreScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [guestFilter, setGuestFilter] = useState<GuestFilter>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [queueLiveAt, setQueueLiveAt] = useState<string | null>(null);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const { showToast } = useFeedback();

  // Resolve the restaurant
  const venueQuery = useApiQuery(
    ['single-restaurant-venue'],
    async () => {
      const all = await fetchRestaurants({ limit: 50 });
      return all.data ?? [];
    },
    { retry: 1 },
  );

  const venues = useMemo(() => venueQuery.data ?? [], [venueQuery.data]);
  const restaurant = venues.find((venue) => venue.id === EXPLORE_RESTAURANT_ID) ?? null;
  const restaurantId = EXPLORE_RESTAURANT_ID;

  // Fetch real tables for this restaurant
  const tablesQuery = useApiQuery(
    ['restaurant-tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId), retry: 1 },
  );

  // Notifications badge
  const notifications = useApiQuery(['notifications', 'unread'], () =>
    fetchNotifications(true),
  );
  const unreadCount = notifications.data?.unreadCount ?? 0;

  // This customer's live queue spot: null → promo card, entry → spot card.
  const myQueue = useApiQuery(['queue', 'mine'], () => fetchMyQueue());
  const queueEntry = myQueue.data?.data ?? null;
  const queueRestaurantId = queueEntry?.restaurantId ?? null;

  const refreshQueueSpot = useCallback(() => {
    myQueue.refetch();
    setQueueLiveAt(new Date().toISOString());
  }, [myQueue]);

  // FR05 — the "your place in line" card updates live while Home is open.
  useEffect(() => {
    if (!queueRestaurantId) return;
    const unsubscribe = onQueueUpdated(queueRestaurantId, refreshQueueSpot);
    return unsubscribe;
  }, [queueRestaurantId, refreshQueueSpot]);

  // Real-time synchronization via Socket.IO
  const refetchTables = useCallback(() => {
    tablesQuery.refetch();
  }, [tablesQuery]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onTableUpdated(restaurantId, refetchTables);
    return unsub;
  }, [restaurantId, refetchTables]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      venueQuery.refetch(),
      tablesQuery.refetch(),
      notifications.refetch(),
      myQueue.refetch(),
    ]);
    setRefreshing(false);
  }

  const allTables = useMemo<Table[]>(() => tablesQuery.data?.data ?? [], [tablesQuery.data?.data]);
  const availableCount = allTables.filter((t) => t.status === 'available').length;
  const totalCount = allTables.length;

  // Distinct locations for filter chips
  const locations = useMemo(() => {
    const set = new Set<string>();
    allTables.forEach((t) => {
      if (t.location) set.add(t.location);
    });
    return Array.from(set);
  }, [allTables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return allTables.filter((table) => {
      // Availability filter
      if (availabilityFilter === 'available' && table.status !== 'available') {
        return false;
      }
      if (availabilityFilter === 'reserved' && table.status === 'available') {
        return false;
      }

      // Guest/Capacity filter
      if (guestFilter === '2' && table.capacity !== 2) return false;
      if (guestFilter === '4' && table.capacity !== 4) return false;
      if (guestFilter === '6+' && table.capacity < 6) return false;

      // Location filter
      if (locationFilter !== 'all' && table.location !== locationFilter) {
        return false;
      }

      return true;
    });
  }, [allTables, availabilityFilter, guestFilter, locationFilter]);

  // Restaurants that currently run a virtual queue (FR03).
  const queueEnabledVenues = useMemo(
    () => venues.filter(
      (venue) => venue.id === EXPLORE_RESTAURANT_ID && venue.isQueueEnabled,
    ),
    [venues],
  );

  function onJoinQueue() {
    const target = queueEnabledVenues[0];
    if (!target) {
      showToast('No restaurants are running a virtual queue right now.', 'info');
      return;
    }
    setPendingQueueRestaurant(target.id);
    router.push('/queue/join');
  }

  function onSelectTable(table: Table) {
    if (!restaurant) return;
    router.push({
      pathname: '/reserve',
      params: {
        restaurantId: EXPLORE_RESTAURANT_ID,
        tableId: table.id || table._id || '',
        tableNumber: formatTableLabel(table.tableNumber),
        partySize: String(table.capacity),
      },
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {restaurant?.name ? (
              <AppText variant="caption" style={styles.restaurantContext}>
                {restaurant.name.toUpperCase()} · {restaurant.city || 'JAFFNA'}
              </AppText>
            ) : null}
            <AppText variant="title" style={styles.pageTitle}>
              Choose Your Table
            </AppText>
            <AppText variant="secondary" style={styles.subtitle}>
              Find a table that’s perfect for your group.
            </AppText>
          </View>

          <Pressable
            style={styles.bell}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
          >
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            {unreadCount > 0 ? (
              <View style={styles.bellBadge}>
                <AppText style={styles.bellBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Live Availability Bar */}
        <View style={styles.liveBar}>
          <View style={styles.liveDotRow}>
            <View style={styles.liveDot} />
            <AppText variant="label" style={styles.liveBarTitle}>
              Live Availability
            </AppText>
          </View>
          <AppText variant="secondary">
            {availableCount} of {totalCount} tables free
          </AppText>
        </View>

        {/* Compact Filters Area */}
        <View style={styles.filterSection}>
          {/* Availability chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Chip
              label="All Tables"
              selected={availabilityFilter === 'all'}
              onPress={() => setAvailabilityFilter('all')}
            />
            <Chip
              label="Available Only"
              selected={availabilityFilter === 'available'}
              onPress={() => setAvailabilityFilter('available')}
            />
            <Chip
              label="Reserved"
              selected={availabilityFilter === 'reserved'}
              onPress={() => setAvailabilityFilter('reserved')}
            />
          </ScrollView>

          {/* Guests / Capacity chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Chip
              label="All Guests"
              selected={guestFilter === 'all'}
              onPress={() => setGuestFilter('all')}
            />
            <Chip
              label="2 Guests"
              selected={guestFilter === '2'}
              onPress={() => setGuestFilter('2')}
            />
            <Chip
              label="4 Guests"
              selected={guestFilter === '4'}
              onPress={() => setGuestFilter('4')}
            />
            <Chip
              label="6+ Guests"
              selected={guestFilter === '6+'}
              onPress={() => setGuestFilter('6+')}
            />
          </ScrollView>

          {/* Area / Location chips (if multiple locations exist) */}
          {locations.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <Chip
                label="All Areas"
                selected={locationFilter === 'all'}
                onPress={() => setLocationFilter('all')}
              />
              {locations.map((loc) => (
                <Chip
                  key={loc}
                  label={loc}
                  selected={locationFilter === loc}
                  onPress={() =>
                    setLocationFilter((prev) => (prev === loc ? 'all' : loc))
                  }
                />
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* Virtual queue (FR03–FR05): live spot card, or the promo card */}
        {myQueue.isLoading ? (
          <Skeleton height={172} radius={radius.xl} />
        ) : queueEntry ? (
          <View
            style={styles.spotCard}
            accessibilityLabel={`Your place in line at ${
              queueEntry.restaurant?.name ?? 'the restaurant'
            }, position ${queueEntry.position}`}
          >
            <View style={styles.spotTop}>
              <View style={styles.spotNumberBlock}>
                <AppText variant="numeral" style={styles.spotNumber}>
                  {queueEntry.position}
                </AppText>
                <AppText variant="caption" style={styles.spotNumberLabel}>
                  place in line
                </AppText>
              </View>

              <View style={styles.spotMeta}>
                <AppText variant="label" style={styles.spotRestaurant}>
                  {queueEntry.restaurant?.name ?? 'Your restaurant'}
                </AppText>
                <AppText variant="caption" style={styles.spotWait}>
                  {queueEntry.estimatedWaitLabel} · {queueEntry.ordersAhead}{' '}
                  {queueEntry.ordersAhead === 1 ? 'order' : 'orders'} ahead
                </AppText>
                <View style={styles.spotLiveRow}>
                  <LiveDot color={colors.accent} />
                  <AppText variant="caption" style={styles.spotLiveText}>
                    Live · {relativeLabel(queueLiveAt ?? queueEntry.lastUpdated)}
                  </AppText>
                </View>
              </View>
            </View>

            <Button
              label="View queue"
              variant="accent"
              onPress={() => router.push('/(tabs)/queue')}
              accessibilityLabel="Open the queue tracker"
              testID="view-queue"
            />
          </View>
        ) : (
          <View style={styles.promoCard}>
            <View style={styles.promoHeader}>
              <View style={styles.promoIcon}>
                <Ionicons name="people-outline" size={18} color={colors.primary} />
              </View>
              <Pressable
                onPress={() => setHowItWorksOpen(true)}
                style={styles.promoInfo}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="How the virtual queue works"
                testID="queue-how-it-works"
              >
                <Ionicons
                  name="information-circle-outline"
                  size={26}
                  color={colors.primary}
                />
              </Pressable>
            </View>

            <AppText variant="heading">
              Takeaway without the wait
            </AppText>
            <AppText variant="secondary">
              Order your parcel from anywhere, track it live, and we&apos;ll tell you
              the moment it&apos;s ready to collect.
            </AppText>

            <Button
              label="Join a queue"
              onPress={onJoinQueue}
              accessibilityLabel="Join a virtual queue"
              testID="join-a-queue"
            />
          </View>
        )}

        {/* Table Cards List */}
        {tablesQuery.isLoading ? (
          <View style={styles.loadingList}>
            <TableCardSkeleton />
            <TableCardSkeleton />
          </View>
        ) : tablesQuery.isError ? (
          <ErrorState
            message={apiErrorMessage(tablesQuery.error)}
            onRetry={() => tablesQuery.refetch()}
          />
        ) : filteredTables.length === 0 ? (
          <EmptyState
            title="No matching tables"
            message="Try adjusting your guest count or availability filters above to see more tables."
            glyph="🪑"
            action={
              <Button
                label="Show All Tables"
                variant="secondary"
                onPress={() => {
                  setAvailabilityFilter('all');
                  setGuestFilter('all');
                  setLocationFilter('all');
                }}
              />
            }
          />
        ) : (
          <View style={styles.tableList}>
            {filteredTables.map((table) => (
              <TableCardItem
                key={table.id || table.tableNumber}
                table={table}
                onSelect={() => onSelectTable(table)}
              />
            ))}
          </View>
        )}

        <LastUpdated timestamp={tablesQuery.data?.lastUpdated} live />
      </ScrollView>

      {/* "How it works" bottom sheet (FR03 first-time explainer) */}
      <Modal
        visible={howItWorksOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHowItWorksOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetScrim}
            onPress={() => setHowItWorksOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close how it works"
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <AppText variant="heading">How it works</AppText>
              <Pressable
                onPress={() => setHowItWorksOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <View key={step.title} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <AppText variant="label" style={styles.stepNumberText}>
                    {index + 1}
                  </AppText>
                </View>
                <View style={styles.stepBody}>
                  <AppText variant="label">{step.title}</AppText>
                  <AppText variant="secondary">{step.description}</AppText>
                </View>
              </View>
            ))}

            <Button
              label="Got it"
              variant="secondary"
              onPress={() => setHowItWorksOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/**
 * Table Card Component
 *
 * Implements the required structure:
 * ┌─────────────────────────────┐
 * │        Table Image          │
 * │                             │
 * │  Table 04          Available│
 * │  Seats 4                    │
 * │  Window Side                │
 * │                             │
 * │       [ Select Table ]      │
 * └─────────────────────────────┘
 */
function TableCardItem({
  table,
  onSelect,
}: {
  table: Table;
  onSelect: () => void;
}) {
  const isAvailable = table.status === 'available';
  const tableLabel = formatTableLabel(table.tableNumber);
  const locationLabel = table.location || 'Indoor';
  const imageUrl = getTableImage(table);

  const statusTone = isAvailable
    ? 'success'
    : table.status === 'reserved'
      ? 'warning'
      : 'neutral';

  const statusLabel = isAvailable
    ? 'Available'
    : table.status === 'reserved'
      ? 'Reserved'
      : 'Unavailable';

  return (
    <Card padded={false} style={[styles.card, !isAvailable && styles.cardUnavailable]}>
      {/* Table Image */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: imageUrl }} style={styles.cardImage} />
        <View style={styles.imageOverlayBadge}>
          <Badge label={statusLabel} tone={statusTone} />
        </View>
      </View>

      {/* Card Body */}
      <View style={styles.cardBody}>
        {/* Table Name & Status */}
        <View style={styles.cardHeaderRow}>
          <AppText variant="heading" style={styles.tableTitle}>
            {tableLabel}
          </AppText>
          <Badge label={statusLabel} tone={statusTone} />
        </View>

        {/* Capacity & Location details */}
        <View style={styles.detailsBlock}>
          <View style={styles.detailRow}>
            <Ionicons name="people-outline" size={17} color={colors.textSecondary} />
            <AppText variant="bodyMedium" style={styles.detailText}>
              Seats {table.capacity}
            </AppText>
          </View>

          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={17} color={colors.textSecondary} />
            <AppText variant="secondary" style={styles.detailText}>
              {locationLabel}
            </AppText>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          {isAvailable ? (
            <Button
              label="Select Table"
              onPress={onSelect}
              accessibilityLabel={`Select ${tableLabel}, Seats ${table.capacity}, ${locationLabel}`}
            />
          ) : (
            <Button
              label="View Available Times"
              onPress={onSelect}
              variant="secondary"
              accessibilityLabel={`View available times for ${tableLabel}`}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

function TableCardSkeleton() {
  return (
    <Card padded={false} style={styles.card}>
      <Skeleton height={150} radius={0} />
      <View style={styles.cardBody}>
        <View style={styles.cardHeaderRow}>
          <Skeleton height={24} width="40%" />
          <Skeleton height={24} width="25%" radius={radius.pill} />
        </View>
        <Skeleton height={18} width="35%" />
        <Skeleton height={18} width="45%" />
        <Skeleton height={48} radius={radius.md} style={{ marginTop: spacing.xs }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: 3,
  },
  restaurantContext: {
    letterSpacing: 1,
    color: colors.primaryMuted,
    fontWeight: '700',
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    color: colors.textOnPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveBarTitle: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  filterSection: {
    gap: spacing.sm,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  promoCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  promoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoInfo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.raised,
  },
  spotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  spotNumberBlock: {
    alignItems: 'center',
    minWidth: 92,
  },
  spotNumber: {
    fontSize: 52,
    lineHeight: 56,
    textAlign: 'center',
  },
  spotNumberLabel: {
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  spotMeta: {
    flex: 1,
    gap: 2,
  },
  spotRestaurant: {
    color: colors.textOnPrimary,
    fontSize: 15,
  },
  spotWait: {
    color: 'rgba(255,255,255,0.8)',
  },
  spotLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  spotLiveText: {
    color: colors.accent,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing['2xl'],
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: colors.textPrimary,
  },
  stepBody: {
    flex: 1,
    gap: 2,
  },
  loadingList: {
    gap: spacing.lg,
  },
  tableList: {
    gap: spacing.xl,
  },
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardUnavailable: {
    opacity: 0.88,
  },
  imageContainer: {
    width: '100%',
    height: 155,
    backgroundColor: colors.skeleton,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlayBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableTitle: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  detailsBlock: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
  },
  actionContainer: {
    marginTop: spacing.xs,
  },
});
