import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  LastUpdated,
  RowSkeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  clearNotifications,
  fetchNotifications,
  fetchEligibleOffers,
  markAllNotificationsRead,
  markNotificationRead,
  type Offer,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  reservation: 'calendar-outline',
  queue: 'people-outline',
  'table-ready': 'restaurant',
  'queue-update': 'sync-outline',
  offer: 'pricetag-outline',
  account: 'person-outline',
  general: 'notifications-outline',
};

/** Notifications list (spec §5). */
export default function NotificationsScreen() {
  const { showToast } = useFeedback();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const query = useApiQuery(['notifications', filter], () =>
    fetchNotifications(filter === 'unread'),
  );

  const rows = query.data?.data ?? [];
  const unread = query.data?.unreadCount ?? 0;
  const expandedNotification = rows.find(
    (item) => item.id === expandedOfferId && item.type === 'offer',
  );
  const offerId = expandedNotification?.data.offerId;
  const restaurantId = expandedNotification?.data.restaurantId;
  const offerQuery = useApiQuery(
    ['notification-offer', String(offerId ?? ''), String(restaurantId ?? '')],
    () => fetchEligibleOffers(String(restaurantId)),
    { enabled: Boolean(expandedOfferId && offerId && restaurantId) },
  );
  const expandedOffer = offerQuery.data?.data?.find(
    (offer) => String(offer.id) === String(offerId),
  );

  async function onOpen(id: string, route?: string) {
    try {
      const notification = rows.find((item) => item.id === id);
      await markNotificationRead(id);
      query.refetch();
      if (notification?.type === 'offer') {
        setExpandedOfferId((current) => (current === id ? null : id));
      } else if (route) {
        router.push(route as never);
      }
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onMarkAll() {
    try {
      await markAllNotificationsRead();
      query.refetch();
      showToast('All caught up.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onClear() {
    try {
      await clearNotifications();
      setExpandedOfferId(null);
      await query.refetch();
      showToast('Notifications cleared.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitle}>
          <AppText variant="label">Notifications</AppText>
          <AppText variant="caption">
            {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
          </AppText>
        </View>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear notifications"
          style={styles.clearButton}
        >
          <AppText variant="label" style={styles.clearButtonText}>Clear</AppText>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Chip
          label="All"
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`Unread${unread ? ` (${unread})` : ''}`}
          selected={filter === 'unread'}
          onPress={() => setFilter('unread')}
        />
        <View style={styles.spacer} />
        <Pressable onPress={onMarkAll} accessibilityRole="button" style={styles.markAll}>
          <AppText variant="label" style={styles.markAllText}>
            Mark all read
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LastUpdated timestamp={query.data?.lastUpdated} />

        {query.isLoading ? (
          <RowSkeleton count={4} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            message="Booking confirmations, queue updates and table-ready alerts land here."
            glyph="🔔"
          />
        ) : (
          <View style={styles.list}>
            {rows.map((item) => (
              <Animated.View
                key={item.id}
                style={styles.notificationGroup}
                entering={item.read ? undefined : FadeInDown.duration(420)}
              >
                <Pressable
                  onPress={() => onOpen(item.id, item.route)}
                  style={[styles.item, !item.read && styles.itemUnread]}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.body}`}
                >
                  <View style={[styles.icon, !item.read && styles.iconUnread]}>
                    <Ionicons
                      name={TYPE_ICONS[item.type] ?? 'notifications-outline'}
                      size={17}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.itemBody}>
                    <View style={styles.itemTop}>
                      <AppText variant="label" style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </AppText>
                      {!item.read ? <NewBadgePulse /> : null}
                      {item.type === 'offer' ? (
                        <Ionicons
                          name={expandedOfferId === item.id ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.primary}
                        />
                      ) : null}
                    </View>
                    <AppText variant="secondary" numberOfLines={2}>
                      {item.body}
                    </AppText>
                    <AppText variant="caption">{relativeTime(item.createdAt)}</AppText>
                  </View>
                </Pressable>
                {expandedOfferId === item.id ? (
                  <OfferCard
                    offer={expandedOffer}
                    restaurantId={String(restaurantId ?? '')}
                    loading={offerQuery.isLoading}
                  />
                ) : null}
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <AppText variant="label" style={selected ? styles.chipTextActive : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * Gentle breathing glow on the "New" badge of an unread notification, so the
 * green card visibly calls for attention. Stops itself under reduce-motion.
 */
function NewBadgePulse() {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [glow]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + glow.value * 0.12 }],
    shadowOpacity: 0.15 + glow.value * 0.35,
  }));

  return (
    <Animated.View style={[styles.newBadgePulse, style]}>
      <Badge label="New" tone="accent" />
    </Animated.View>
  );
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function OfferCard({
  offer,
  restaurantId,
  loading,
}: {
  offer?: Offer;
  restaurantId: string;
  loading: boolean;
}) {
  if (loading) {
    return <View style={styles.offerCard}><RowSkeleton count={2} /></View>;
  }
  if (!offer) {
    return (
      <View style={styles.offerCard}>
        <AppText variant="caption">This offer is no longer available.</AppText>
      </View>
    );
  }

  const numericValue = offer.value.replace(/[^\d.]/g, '');
  const discount = offer.type === 'Percentage' ? `${numericValue}% OFF` : `Rs. ${numericValue}`;

  return (
    <View style={styles.offerCard}>
      <Image source={{ uri: offer.image }} style={styles.offerImage} accessibilityLabel="Offer image" />
      <View style={styles.offerDetails}>
        <View style={styles.exclusiveBadge}>
          <Ionicons name="gift-outline" size={14} color={colors.danger} />
          <AppText variant="caption" style={styles.exclusiveText}>Exclusive Offer</AppText>
        </View>
        <AppText variant="heading" style={styles.offerTitle}>{offer.title}</AppText>
        <AppText variant="display" style={styles.offerDiscount}>{discount}</AppText>
        <AppText variant="body" style={styles.offerSubtitle}>on your next visit</AppText>
        <AppText variant="secondary" style={styles.offerDescription}>{offer.description}</AppText>
        <View style={styles.offerInfo}>
          <OfferInfoRow
            icon="calendar-outline"
            label="Valid Period"
            value={`${formatOfferDate(offer.startDate)} - ${formatOfferDate(offer.endDate)}`}
          />
          <OfferInfoRow
            icon="people-outline"
            label="Eligibility"
            value={`You are eligible (${offer.requiredReservations} completed reservation${offer.requiredReservations === 1 ? '' : 's'})`}
            success
          />
        </View>
        <Pressable
          style={styles.bookButton}
          onPress={() => router.push('/(tabs)/explore')}
          accessibilityRole="button"
          accessibilityLabel="Book a table"
        >
          <Ionicons name="calendar-outline" size={17} color={colors.textOnPrimary} />
          <AppText variant="label" style={styles.bookButtonText}>Book a Table</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function formatOfferDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day} ${new Date(Number(year), Number(month) - 1).toLocaleString(undefined, { month: 'short' })} ${year}` : value;
}

function OfferInfoRow({
  icon,
  label,
  value,
  success = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <View style={styles.offerInfoRow}>
      <Ionicons name={icon} size={21} color={colors.textSecondary} />
      <View style={styles.offerInfoText}>
        <AppText variant="caption" style={styles.offerInfoLabel}>{label}</AppText>
        <AppText variant="bodyMedium" style={success ? styles.offerEligibility : undefined}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
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
  clearButton: {
    minWidth: 56,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: colors.textOnPrimary,
  },
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  spacer: { flex: 1 },
  markAll: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  markAllText: { color: colors.primary, textDecorationLine: 'underline' },
  chip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextActive: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  list: { gap: spacing.sm },
  notificationGroup: { gap: spacing.xs },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  itemUnread: { borderColor: colors.primary, backgroundColor: colors.infoBox },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.accent },
  itemBody: { flex: 1, gap: 3 },
  newBadgePulse: {
    shadowColor: colors.accent,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1 },
  offerCard: {
    marginTop: spacing.xs,
    backgroundColor: '#FFFDFC',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#F0B8AE',
    overflow: 'hidden',
  },
  offerImage: {
    width: '100%',
    height: 172,
    backgroundColor: colors.primarySoft,
  },
  offerDetails: { padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  exclusiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: '#FDE6E2',
    marginTop: -spacing.xs,
  },
  exclusiveText: { color: colors.danger },
  offerTitle: { color: colors.primary, textAlign: 'center', marginTop: spacing.xs },
  offerDiscount: { color: '#E53935', fontSize: 32, lineHeight: 38 },
  offerSubtitle: { color: colors.primary, marginTop: -spacing.xs },
  offerDescription: { textAlign: 'center', maxWidth: 330, marginTop: spacing.xs },
  offerInfo: {
    width: '100%',
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  offerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  offerInfoText: { flex: 1, gap: 2 },
  offerInfoLabel: { color: colors.textSecondary },
  offerEligibility: { color: '#2E7D32' },
  bookButton: {
    width: '100%',
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  bookButtonText: {
    color: colors.textOnPrimary,
  },
});
