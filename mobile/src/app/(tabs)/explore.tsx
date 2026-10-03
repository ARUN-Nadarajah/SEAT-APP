import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Chip,
  EmptyState,
  ErrorState,
  LastUpdated,
  RestaurantCardSkeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
  fetchNotifications,
  fetchRestaurants,
  type RestaurantCard,
} from '@/services/api';
import { colors, radius, shadow, spacing } from '@/theme';

const FILTERS = [
  { key: 'all', label: 'All places' },
  { key: 'sri-lankan', label: 'Sri Lankan' },
  { key: 'tonight', label: 'Tonight' },
  { key: 'filters', label: 'Filters' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/**
 * Home / Explore (spec §5 + FR01).
 *
 * Shows greeting, location, search, filter chips and restaurant cards with
 * live availability: "Tonight from 7:00 PM", walk-in wait and free tables.
 */
export default function ExploreScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [refreshing, setRefreshing] = useState(false);

  const restaurants = useApiQuery(
    ['restaurants', search, activeFilter],
    () =>
      fetchRestaurants({
        q: search.trim() || undefined,
        cuisine: activeFilter === 'sri-lankan' ? 'Sri Lankan' : undefined,
        tonight: activeFilter === 'tonight',
      }),
    { retry: 0 },
  );

  const notifications = useApiQuery(['notifications', 'unread'], () =>
    fetchNotifications(true),
  );

  const unreadCount = notifications.data?.unreadCount ?? 0;
  const cards = restaurants.data?.data ?? [];

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([restaurants.refetch(), notifications.refetch()]);
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Greeting + location + notification bell */}
        <View style={styles.topRow}>
          <View style={styles.greetingBlock}>
            <AppText variant="caption">{greeting},</AppText>
            <AppText variant="title" numberOfLines={1}>
              Where shall we eat today?
            </AppText>
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
              <AppText variant="secondary">Jaffna, Sri Lanka</AppText>
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

        {/* Search */}
        <View style={styles.searchShell}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search restaurants or cuisine"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            accessibilityLabel="Search restaurants"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {FILTERS.map((filter) => (
            <Chip
              key={filter.key}
              label={filter.label}
              selected={activeFilter === filter.key}
              onPress={() =>
                setActiveFilter((current) =>
                  current === filter.key && filter.key !== 'all' ? 'all' : filter.key,
                )
              }
            />
          ))}
        </ScrollView>

        <LastUpdated
          timestamp={restaurants.data?.lastUpdated}
          live
          label={
            restaurants.isFetching && !restaurants.isRefetching
              ? 'Refreshing availability…'
              : undefined
          }
        />

        {/* Results */}
        {restaurants.isLoading ? (
          <View style={styles.list}>
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
          </View>
        ) : restaurants.isError ? (
          <ErrorState
            message={apiErrorMessage(restaurants.error)}
            onRetry={() => restaurants.refetch()}
          />
        ) : cards.length === 0 ? (
          <EmptyState
            title="No places match that"
            message="Try a different search, or switch the filter back to “All places”."
            glyph="🔍"
          />
        ) : (
          <View style={styles.list}>
            {cards.map((card) => (
              <RestaurantCardItem key={card.id} card={card} />
            ))}
          </View>
        )}

        <AppText variant="caption" style={styles.hint}>
          {user ? `Signed in as ${user.name} · ` : ''}
          Availability refreshes every time you pull to refresh.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Explore card (FR01) — the whole card is one tap target. */
function RestaurantCardItem({ card }: { card: RestaurantCard }) {
  const statusTone =
    card.availabilityStatus === 'available'
      ? 'success'
      : card.availabilityStatus === 'limited'
        ? 'warning'
        : 'danger';

  const statusLabel =
    card.availabilityStatus === 'fully-booked'
      ? 'Fully booked'
      : `${card.availableTables} table${card.availableTables === 1 ? '' : 's'} free`;

  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/restaurant/${card.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${card.name}, ${card.cuisine}, ${statusLabel}`}
    >
      {card.image ? (
        <Image source={{ uri: card.image }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImageFallback]}>
          <Ionicons name="restaurant" size={26} color={colors.primary} />
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <AppText variant="heading" numberOfLines={1} style={styles.cardTitle}>
            {card.name}
          </AppText>
          <View style={styles.rating}>
            <Ionicons name="star" size={12} color={colors.warning} />
            <AppText variant="caption">{card.rating.toFixed(1)}</AppText>
          </View>
        </View>

        <AppText variant="secondary" numberOfLines={1}>
          {card.cuisine} · {formatDistance(card.distanceMeters)} · {card.priceRange}
        </AppText>

        <View style={styles.metaRow}>
          <Badge label={card.firstSlotLabel} tone="neutral" />
          <Badge label={card.walkInWaitLabel} tone="neutral" />
        </View>

        <View style={styles.cardFooter}>
          <Badge label={statusLabel} tone={statusTone} />
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <AppText variant="caption">Live</AppText>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function formatDistance(meters?: number): string {
  if (!meters && meters !== 0) return '';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km away` : `${meters} m away`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  greetingBlock: { flex: 1, gap: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
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
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  list: { gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  cardImage: { width: '100%', height: 150, backgroundColor: colors.skeleton },
  cardImageFallback: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: spacing.lg, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { flex: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  hint: { textAlign: 'center', color: colors.textMuted, marginTop: spacing.sm },
});
