import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
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
  InfoBox,
  LastUpdated,
  Skeleton,
} from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchNotifications,
  fetchRestaurant,
  fetchRestaurants,
  fetchTables,
  type Table,
  type TableStatus,
} from '@/services/api';
import { onQueueUpdated, onTableUpdated } from '@/services/realtime/socket';
import { colors, radius, shadow, spacing } from '@/theme';

type TableStatusFilter = 'all' | TableStatus;

/**
 * Single-Restaurant Home & Available Tables screen (FR01, FR03, FR08).
 *
 * For a single-restaurant model, this screen presents the restaurant's
 * identity, live status, menu/arrival shortcuts, reservation & queue actions,
 * and an interactive real-time grid of all available tables.
 */
export default function ExploreScreen() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [showQueueHelp, setShowQueueHelp] = useState(false);

  // 1. Resolve the single restaurant
  const venueQuery = useApiQuery(
    ['single-restaurant'],
    async () => {
      const all = await fetchRestaurants({ limit: 1 });
      const first = all.data?.[0];
      if (!first?.id) return null;
      const detail = await fetchRestaurant(first.id, { partySize: 2 });
      return detail.data;
    },
    { retry: 1 },
  );

  const restaurant = venueQuery.data ?? null;
  const restaurantId = restaurant?.id ?? '';

  // 2. Fetch live tables for this restaurant
  const tablesQuery = useApiQuery(
    ['restaurant-tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId), retry: 1 },
  );

  // 3. Notifications unread badge
  const notifications = useApiQuery(['notifications', 'unread'], () =>
    fetchNotifications(true),
  );

  const unreadCount = notifications.data?.unreadCount ?? 0;

  // Real-time synchronization via Socket.IO
  const refreshAll = useCallback(() => {
    tablesQuery.refetch();
    venueQuery.refetch();
  }, [tablesQuery, venueQuery]);

  useEffect(() => {
    if (!restaurantId) return;

    const unsubTables = onTableUpdated(restaurantId, refreshAll);
    const unsubQueue = onQueueUpdated(restaurantId, () => venueQuery.refetch());

    return () => {
      unsubTables();
      unsubQueue();
    };
  }, [restaurantId, refreshAll, venueQuery]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([
      venueQuery.refetch(),
      tablesQuery.refetch(),
      notifications.refetch(),
    ]);
    setRefreshing(false);
  }

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const allTables: Table[] = tablesQuery.data?.data ?? [];
  const tableSummary = tablesQuery.data?.summary ?? {
    total: allTables.length,
    available: allTables.filter((t) => t.status === 'available').length,
    occupied: allTables.filter((t) => t.status === 'occupied').length,
    reserved: allTables.filter((t) => t.status === 'reserved').length,
    maintenance: allTables.filter((t) => t.status === 'maintenance').length,
  };

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
    return allTables.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (locationFilter !== 'all' && t.location !== locationFilter) return false;
      return true;
    });
  }, [allTables, statusFilter, locationFilter]);

  const availability = restaurant?.availability;
  const waitLabel = availability?.walkInWait?.label ?? restaurant?.walkInWaitLabel ?? '15–20 min';
  const queueLength = availability?.queueLength ?? restaurant?.queueLength ?? 0;
  const isFullyBooked = availability?.status === 'fully-booked' || availability?.isFullyBooked;

  function onReserveTable(table?: Table) {
    if (!restaurant) return;
    router.push({
      pathname: '/reserve',
      params: {
        restaurantId: restaurant.id,
        tableId: table?.id ?? '',
        tableNumber: table?.tableNumber ?? '',
        partySize: table ? String(table.capacity) : '2',
      },
    });
  }

  function onJoinQueue() {
    if (!restaurant) return;
    router.push({
      pathname: '/queue/join',
      params: { restaurantId: restaurant.id },
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
        {/* Top greeting & notification bar */}
        <View style={styles.topRow}>
          <View style={styles.greetingBlock}>
            <AppText variant="caption">
              {greeting}
              {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </AppText>
            <AppText variant="title" numberOfLines={1}>
              {restaurant?.name ?? 'Welcome to SEAT'}
            </AppText>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
              <AppText variant="secondary">
                {restaurant?.address ? `${restaurant.address}, ${restaurant.city}` : 'Jaffna, Sri Lanka'}
              </AppText>
            </View>
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

        {venueQuery.isLoading ? (
          <View style={styles.loadingContainer}>
            <Skeleton height={200} radius={radius.lg} />
            <Skeleton height={28} width="60%" />
            <Skeleton height={18} width="40%" />
            <Skeleton height={100} radius={radius.lg} />
            <Skeleton height={200} radius={radius.lg} />
          </View>
        ) : venueQuery.isError || !restaurant ? (
          <ErrorState
            message={apiErrorMessage(venueQuery.error) || 'Failed to load restaurant details.'}
            onRetry={onRefresh}
          />
        ) : (
          <>
            {/* Restaurant Hero Card */}
            <Card style={styles.heroCard}>
              {restaurant.image ? (
                <Image source={{ uri: restaurant.image }} style={styles.heroImage} />
              ) : (
                <View style={[styles.heroImage, styles.heroFallback]}>
                  <Ionicons name="restaurant" size={38} color={colors.primary} />
                </View>
              )}

              <View style={styles.heroBody}>
                <View style={styles.heroTitleRow}>
                  <View style={styles.heroTitleBlock}>
                    <AppText variant="heading" style={styles.restaurantName}>
                      {restaurant.name}
                    </AppText>
                    <AppText variant="secondary">
                      {restaurant.cuisine} · {restaurant.priceRange}
                    </AppText>
                  </View>
                  <View style={styles.ratingBox}>
                    <Ionicons name="star" size={14} color={colors.warning} />
                    <AppText variant="label">{restaurant.rating.toFixed(1)}</AppText>
                    <AppText variant="caption">({restaurant.reviewCount})</AppText>
                  </View>
                </View>

                {restaurant.description ? (
                  <AppText variant="body" numberOfLines={3} style={styles.description}>
                    {restaurant.description}
                  </AppText>
                ) : null}

                {/* Feature Chips */}
                <View style={styles.chipRow}>
                  <Badge label={restaurant.openHoursLabel || 'Open daily'} tone="neutral" />
                  <Badge
                    label={restaurant.parkingLabel || 'Parking available'}
                    tone={restaurant.parking ? 'success' : 'neutral'}
                  />
                  <Badge
                    label={`${tableSummary.available} tables available`}
                    tone={tableSummary.available > 0 ? 'success' : 'danger'}
                  />
                </View>

                {/* Supporting Links: Menu & Location */}
                <View style={styles.linksRow}>
                  <Pressable
                    style={styles.linkButton}
                    onPress={() => router.push(`/restaurant/${restaurant.id}/menu`)}
                    accessibilityRole="button"
                    accessibilityLabel="Explore the menu"
                  >
                    <Ionicons name="book-outline" size={17} color={colors.primary} />
                    <AppText variant="label" style={styles.linkLabel}>
                      Explore Menu
                    </AppText>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </Pressable>

                  <Pressable
                    style={styles.linkButton}
                    onPress={() => router.push(`/restaurant/${restaurant.id}/location`)}
                    accessibilityRole="button"
                    accessibilityLabel="Directions and arrival"
                  >
                    <Ionicons name="map-outline" size={17} color={colors.primary} />
                    <AppText variant="label" style={styles.linkLabel}>
                      Directions
                    </AppText>
                    <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            </Card>

            {/* Live Availability Highlights */}
            <View style={styles.infoRow}>
              <Card style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <AppText variant="label">Book Ahead</AppText>
                </View>
                <AppText variant="heading" numberOfLines={1}>
                  {availability?.firstSlot
                    ? `From ${availability.firstSlot.label}`
                    : restaurant.firstSlotLabel || 'Available'}
                </AppText>
                <AppText variant="caption">
                  {availability?.availableSlots ?? 0} time slots available today
                </AppText>
              </Card>

              <Card style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Ionicons name="hourglass-outline" size={18} color={colors.warning} />
                  <AppText variant="label">Walk-in Wait</AppText>
                </View>
                <AppText variant="heading" numberOfLines={1}>
                  {waitLabel}
                </AppText>
                <AppText variant="caption">
                  {queueLength} {queueLength === 1 ? 'party' : 'parties'} waiting right now
                </AppText>
              </Card>
            </View>

            {/* Quick Actions */}
            <View style={styles.primaryActionBox}>
              <Button
                label="Reserve a table"
                onPress={() => onReserveTable()}
                accessibilityLabel="Reserve a table"
              />

              <Pressable
                onPress={onJoinQueue}
                style={styles.queueButton}
                accessibilityRole="button"
                accessibilityLabel={`Join the queue, ${waitLabel} estimated wait`}
              >
                <View style={styles.queueButtonInner}>
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                  <View style={styles.queueButtonText}>
                    <AppText variant="label" style={styles.queueButtonTitle}>
                      Join Virtual Queue · {waitLabel}
                    </AppText>
                    <AppText variant="caption">
                      {isFullyBooked
                        ? 'All tables currently taken — wait comfortably from home'
                        : `${queueLength} parties waiting in line`}
                    </AppText>
                  </View>
                  <Ionicons name="arrow-forward" size={18} color={colors.primary} />
                </View>
              </Pressable>

              <Pressable
                onPress={() => setShowQueueHelp((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="What is a virtual queue?"
                style={styles.helpToggle}
              >
                <Ionicons
                  name={showQueueHelp ? 'chevron-up' : 'help-circle-outline'}
                  size={16}
                  color={colors.primary}
                />
                <AppText variant="label" style={styles.helpLabel}>
                  How does the virtual queue work?
                </AppText>
              </Pressable>

              {showQueueHelp ? (
                <InfoBox tone="info">
                  <AppText variant="secondary">
                    Join the queue remotely and keep your place in line while waiting
                    from anywhere. We will track your position in real-time and alert
                    you as soon as your table is ready.
                  </AppText>
                </InfoBox>
              ) : null}
            </View>

            {/* AVAILABLE TABLES SECTION */}
            <View style={styles.tablesSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.titleWithLive}>
                    <AppText variant="heading">Available Tables</AppText>
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <AppText variant="caption" style={styles.liveText}>
                        Live
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="secondary">
                    Real-time floor status · Tap an available table to book it
                  </AppText>
                </View>

                <LastUpdated
                  timestamp={tablesQuery.data?.lastUpdated || restaurant.lastUpdated}
                  live
                />
              </View>

              {/* Status summary counters */}
              <View style={styles.statPillsRow}>
                <StatPill
                  label="All"
                  count={tableSummary.total}
                  active={statusFilter === 'all'}
                  onPress={() => setStatusFilter('all')}
                />
                <StatPill
                  label="Available"
                  count={tableSummary.available}
                  tone="success"
                  active={statusFilter === 'available'}
                  onPress={() => setStatusFilter('available')}
                />
                <StatPill
                  label="Occupied"
                  count={tableSummary.occupied}
                  tone="neutral"
                  active={statusFilter === 'occupied'}
                  onPress={() => setStatusFilter('occupied')}
                />
                <StatPill
                  label="Reserved"
                  count={tableSummary.reserved}
                  tone="warning"
                  active={statusFilter === 'reserved'}
                  onPress={() => setStatusFilter('reserved')}
                />
              </View>

              {/* Location filters (if multiple locations/sections exist) */}
              {locations.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.locationChips}
                >
                  <Chip
                    label="All areas"
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

              {/* Tables Grid */}
              {tablesQuery.isLoading ? (
                <View style={styles.tableGrid}>
                  <Skeleton height={110} style={styles.tableGridItem} radius={radius.lg} />
                  <Skeleton height={110} style={styles.tableGridItem} radius={radius.lg} />
                  <Skeleton height={110} style={styles.tableGridItem} radius={radius.lg} />
                  <Skeleton height={110} style={styles.tableGridItem} radius={radius.lg} />
                </View>
              ) : tablesQuery.isError ? (
                <ErrorState
                  message={apiErrorMessage(tablesQuery.error)}
                  onRetry={() => tablesQuery.refetch()}
                />
              ) : filteredTables.length === 0 ? (
                <EmptyState
                  title="No tables found"
                  message="No tables currently match this filter. Try selecting 'All' to see all tables."
                  glyph="🪑"
                />
              ) : (
                <View style={styles.tableGrid}>
                  {filteredTables.map((table) => (
                    <TableGridCard
                      key={table.id || table.tableNumber}
                      table={table}
                      onPress={() => onReserveTable(table)}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Stat Pill button with counter */
function StatPill({
  label,
  count,
  tone,
  active,
  onPress,
}: {
  label: string;
  count: number;
  tone?: 'success' | 'neutral' | 'warning' | 'danger';
  active: boolean;
  onPress: () => void;
}) {
  const dotColor =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.statPill, active && styles.statPillActive]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
    >
      <View style={[styles.statPillDot, { backgroundColor: dotColor }]} />
      <AppText
        variant="label"
        style={[styles.statPillText, active && styles.statPillTextActive]}
      >
        {label}
      </AppText>
      <View style={[styles.statPillCount, active && styles.statPillCountActive]}>
        <AppText
          style={[styles.statPillCountText, active && styles.statPillCountTextActive]}
        >
          {count}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Interactive card for each table */
function TableGridCard({
  table,
  onPress,
}: {
  table: Table;
  onPress: () => void;
}) {
  const isAvailable = table.status === 'available';
  const isOccupied = table.status === 'occupied';
  const isReserved = table.status === 'reserved';

  const tone = isAvailable ? 'success' : isReserved ? 'warning' : 'neutral';
  const statusLabel = isAvailable
    ? 'Available'
    : isOccupied
      ? 'Occupied'
      : isReserved
        ? 'Reserved'
        : 'Maintenance';

  return (
    <Pressable
      style={[
        styles.tableCard,
        isAvailable && styles.tableCardAvailable,
        isOccupied && styles.tableCardOccupied,
        isReserved && styles.tableCardReserved,
      ]}
      onPress={isAvailable ? onPress : undefined}
      disabled={!isAvailable}
      accessibilityRole={isAvailable ? 'button' : 'text'}
      accessibilityLabel={`Table ${table.tableNumber}, ${table.capacity} seats, ${table.location}, ${statusLabel}`}
    >
      <View style={styles.tableCardTop}>
        <View style={styles.tableNumberBadge}>
          <AppText variant="heading" style={styles.tableNumberText}>
            {table.tableNumber}
          </AppText>
        </View>
        <Badge label={statusLabel} tone={tone} />
      </View>

      <View style={styles.tableCardDetails}>
        <View style={styles.tableDetailRow}>
          <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
          <AppText variant="secondary" style={styles.tableDetailText}>
            {table.capacity} Seats
          </AppText>
        </View>

        {table.location ? (
          <View style={styles.tableDetailRow}>
            <Ionicons name="compass-outline" size={14} color={colors.textSecondary} />
            <AppText variant="secondary" style={styles.tableDetailText} numberOfLines={1}>
              {table.location}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.tableCardAction}>
        {isAvailable ? (
          <View style={styles.bookNowRow}>
            <AppText variant="label" style={styles.bookNowText}>
              Reserve
            </AppText>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </View>
        ) : (
          <AppText variant="caption" style={styles.occupiedText}>
            {isOccupied ? 'Seated now' : 'Reserved today'}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  loadingContainer: { gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  greetingBlock: { flex: 1, gap: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
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
  bellBadgeText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '700' },

  // Hero Card
  heroCard: {
    padding: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  heroImage: {
    width: '100%',
    height: 170,
    backgroundColor: colors.skeleton,
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  heroBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroTitleBlock: { flex: 1, gap: 2 },
  restaurantName: { fontSize: 22 },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  description: { color: colors.textSecondary },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  linksRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  linkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  linkLabel: { flex: 1, color: colors.primary },

  // Info cards
  infoRow: { flexDirection: 'row', gap: spacing.md },
  infoCard: { flex: 1, gap: spacing.xs, padding: spacing.md },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Primary Actions
  primaryActionBox: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  queueButton: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.infoBox,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  queueButtonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  queueButtonText: { flex: 1, gap: 2 },
  queueButtonTitle: { fontSize: 14, color: colors.primary },
  helpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  helpLabel: { color: colors.primary, fontSize: 13, textDecorationLine: 'underline' },

  // Tables Section
  tablesSection: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'column',
    gap: spacing.xs,
  },
  sectionHeaderLeft: { gap: 2 },
  titleWithLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: { fontSize: 10, fontWeight: '600', color: colors.success },

  // Stat Pills
  statPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statPillText: { fontSize: 12, color: colors.textPrimary },
  statPillTextActive: { color: colors.textOnPrimary },
  statPillCount: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  statPillCountActive: {
    backgroundColor: colors.primaryMuted,
  },
  statPillCountText: { fontSize: 11, fontWeight: '700', color: colors.textPrimary },
  statPillCountTextActive: { color: colors.textOnPrimary },

  locationChips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },

  // Tables Grid
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tableGridItem: {
    width: '47%',
  },
  tableCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  tableCardAvailable: {
    borderColor: colors.success,
    backgroundColor: colors.surface,
  },
  tableCardOccupied: {
    opacity: 0.72,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  tableCardReserved: {
    opacity: 0.85,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.warning,
  },
  tableCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableNumberBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tableNumberText: {
    fontSize: 16,
    color: colors.primary,
  },
  tableCardDetails: {
    gap: 4,
  },
  tableDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tableDetailText: {
    fontSize: 12,
  },
  tableCardAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: 2,
  },
  bookNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookNowText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  occupiedText: {
    color: colors.textMuted,
    fontSize: 11,
  },
});

