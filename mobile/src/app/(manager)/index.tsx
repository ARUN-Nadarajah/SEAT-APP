import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InfoBox,
  LastUpdated,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useLogout } from '@/hooks/useLogout';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
  fetchDailyBreakdown,
  fetchManagerStats,
  fetchRestaurants,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

type Range = 'today' | 'yesterday' | 'week';

/** ISO date `daysAgo` days before today (UTC, matching the API). */
function todayString(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

/**
 * Manager View (FR10).
 *
 * The venue runs two independent tracks, so the screen is split to match:
 *   • Table reservations — booked parties, scoped by the date filter.
 *   • Virtual queue tracker — the live takeaway line (guests collect at the
 *     counter, no table involved), always current regardless of the filter.
 *
 * Summary cards, an operational detail grid, and a simple bar chart sit
 * under each track.
 */
export default function ManagerDashboardScreen() {
  const { user } = useAuth();
  const { confirmLogout, loggingOut } = useLogout();
  const [range, setRange] = useState<Range>('today');
  const [refreshing, setRefreshing] = useState(false);

  // Date is state, not computed during render (React compiler: purity).
  const [dateParam, setDateParam] = useState(() => todayString(0));
  const [weekFrom] = useState(() => todayString(6));

  function selectRange(next: Range) {
    setRange(next);
    setDateParam(todayString(next === 'yesterday' ? 1 : 0));
  }

  const venueQuery = useApiQuery(['manager-venue'], async () => {
    const all = await fetchRestaurants({ limit: 100 });
    return all.data?.find((r) => r.id === user?.restaurantId) ?? all.data?.[0] ?? null;
  });

  const restaurantId = venueQuery.data?.id ?? user?.restaurantId ?? '';
  // Poll every 30s so "Updated …" always reflects current figures (NFR03).
  const stats = useApiQuery(
    ['manager-stats', restaurantId, dateParam],
    () => fetchManagerStats(restaurantId, dateParam),
    { enabled: Boolean(restaurantId), refetchInterval: 30_000 },
  );

  const daily = useApiQuery(
    ['manager-daily', restaurantId, weekFrom],
    () => fetchDailyBreakdown(restaurantId, { from: weekFrom, days: 7 }),
    {
      enabled: Boolean(restaurantId) && range === 'week',
      refetchInterval: 30_000,
    },
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([stats.refetch(), range === 'week' ? daily.refetch() : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  }

  const data = stats.data?.data;
  const queue = data?.queue;
  const hourly = stats.data?.hourly ?? [];
  const dailyData = daily.data?.data ?? [];
  const peak = Math.max(
    1,
    ...(range === 'week'
      ? dailyData.flatMap((bucket) => [bucket.reservations, bucket.queueCompleted])
      : hourly.flatMap((bucket) => [bucket.reservations, bucket.queueCompleted])),
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="caption">MANAGER VIEW</AppText>
          <AppText variant="title" numberOfLines={1}>
            {venueQuery.data?.name ?? 'Loading…'}
          </AppText>
        </View>
        <Pressable
          style={styles.iconButton}
          onPress={() => {
            confirmLogout();
          }}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        </Pressable>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        </Pressable>
        <Pressable
          style={styles.iconButton}
          onPress={() => router.push('/(staff)')}
          accessibilityRole="button"
          aria-label="Open staff dashboard"
        >
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Date filter — applies to the reservation track and the chart */}
        <View style={styles.filterRow}>
          {(['today', 'yesterday', 'week'] as Range[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => selectRange(option)}
              style={[styles.filter, range === option && styles.filterActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: range === option }}
            >
              <AppText
                variant="label"
                style={range === option ? styles.filterTextActive : styles.filterText}
              >
                {option === 'week' ? 'This week' : option === 'today' ? 'Today' : 'Yesterday'}
              </AppText>
            </Pressable>
          ))}
        </View>

        <LastUpdated timestamp={data?.lastUpdated} live />

        {stats.isLoading ? (
          <View style={styles.cards}>
            <Skeleton height={96} radius={radius.lg} />
            <Skeleton height={96} radius={radius.lg} />
            <Skeleton height={96} radius={radius.lg} />
          </View>
        ) : stats.isError ? (
          <ErrorState message={apiErrorMessage(stats.error)} onRetry={() => stats.refetch()} />
        ) : !data || !queue ? (
          <EmptyState
            title="No figures yet"
            message="Once reservations start coming in, your summary will appear here."
            glyph="📊"
          />
        ) : (
          <>
            <InfoBox tone="info">
              <AppText variant="secondary">
                {range === 'week'
                  ? `Two tracks: reservation figures show today (${data.date}), the chart below shows the last 7 days, and the queue tracker is live.`
                  : `Two tracks: reservation figures are counted for ${data.date}; the takeaway queue tracker is live right now.`}
              </AppText>
            </InfoBox>

            {/* Track 1 — table reservations (date-filtered, FR10) */}
            <View style={styles.sectionHeader}>
              <SectionTitle>Table reservations</SectionTitle>
              <Badge label={range === 'week' ? 'Today' : data.date} tone="neutral" />
            </View>

            <View style={styles.cards}>
              <SummaryCard
                label="Total reservations"
                value={String(data.totalReservations)}
                hint={`${data.changeVsYesterday} vs yesterday`}
                icon="calendar-outline"
              />
              <SummaryCard
                label="No-shows"
                value={String(data.noShows)}
                hint={`${data.cancelled} cancelled`}
                icon="close-circle-outline"
                tone={colors.danger}
              />
              <SummaryCard
                label="Avg party size"
                value={String(data.avgPartySize)}
                hint={`across ${data.totalReservations} bookings`}
                icon="people-outline"
              />
            </View>

            <Card>
              <SectionTitle>Operational detail</SectionTitle>
              <AppText variant="secondary">
                Booked parties for {data.date}: arrivals, expected guests,
                finished tables, and current table capacity.
              </AppText>
              <View style={styles.detailGrid}>
                <Detail label="Checked in" value={String(data.checkedIn)} />
                <Detail label="Still expected" value={String(data.confirmed)} />
                <Detail label="Completed" value={String(data.completed)} />
                <Detail label="Free tables" value={String(data.tableSummary.available)} />
              </View>
            </Card>

            {/* Track 2 — virtual queue tracker (live) */}
            <View style={styles.sectionHeader}>
              <SectionTitle>Virtual queue tracker</SectionTitle>
              <Badge label="Live now" tone="success" />
            </View>

            <View style={styles.cards}>
              <SummaryCard
                label="In queue now"
                value={String(queue.active)}
                hint={`${queue.waiting} waiting · ${queue.ready} ready`}
                icon="list-outline"
                tone={colors.accent}
              />
              <SummaryCard
                label="Joined today"
                value={String(queue.joinedToday)}
                hint={`${queue.collectedToday} collected`}
                icon="walk-outline"
                tone={colors.accent}
              />
              <SummaryCard
                label="Avg pickup wait"
                value={queue.avgPickupWaitLabel}
                hint="From joining to collection"
                icon="hourglass-outline"
                tone={colors.warning}
              />
            </View>

            <Card>
              <SectionTitle>Queue detail</SectionTitle>
              <AppText variant="secondary">
                Live line · full-line estimate {queue.currentWaitLabel}. Guests
                collect at the counter — the queue never uses a table.
              </AppText>
              <View style={styles.detailGrid}>
                <Detail label="Waiting" value={String(queue.waiting)} />
                <Detail label="Preparing" value={String(queue.preparing)} />
                <Detail label="Ready for pickup" value={String(queue.ready)} />
                <Detail label="Collected today" value={String(queue.collectedToday)} />
              </View>
              <InfoBox tone="warning">
                <AppText variant="secondary">
                  {queue.noShowsToday} no-shows · {queue.cancelledToday} left the
                  queue today.
                </AppText>
              </InfoBox>
            </Card>

            {/* Simple chart (FR10) — reservations + queue pickups */}
            <Card>
              <SectionTitle>
                {range === 'week' ? 'Reservations & pickups this week' : 'Reservations by hour'}
              </SectionTitle>
              <AppText variant="secondary">
                {range === 'week'
                  ? 'Each pair of bars is one day: bookings and takeaway pickups.'
                  : `${data.date} · bars show bookings by hour and takeaway pickups by collection hour.`}
              </AppText>

              {range === 'week' && daily.isLoading ? (
                <Skeleton height={140} radius={radius.md} />
              ) : range === 'week' && daily.isError ? (
                <ErrorState
                  message={apiErrorMessage(daily.error)}
                  onRetry={() => daily.refetch()}
                />
              ) : (range === 'week' ? dailyData.length === 0 : hourly.length === 0) ? (
                <InfoBox tone="info">
                  <AppText variant="secondary">
                    No activity logged for this period yet.
                  </AppText>
                </InfoBox>
              ) : (
                <>
                  <View style={styles.chart}>
                    {(range === 'week' ? dailyData : hourly).map((bucket) => {
                      const height = Math.max(4, Math.round((bucket.reservations / peak) * 96));
                      const queueHeight = Math.max(4, Math.round((bucket.queueCompleted / peak) * 96));
                      const bucketLabel = 'date' in bucket ? bucket.date.slice(5) : bucket.label;
                      return (
                        <View
                          key={'date' in bucket ? bucket.date : bucket.hour}
                          style={styles.barColumn}
                        >
                          <AppText variant="caption" style={styles.barValue}>
                            {bucket.reservations || ''}
                          </AppText>
                          <View style={styles.barGroup}>
                            <View
                              style={[
                                styles.bar,
                                { height },
                                bucket.reservations === 0 && styles.barEmpty,
                              ]}
                            />
                            <View
                              style={[
                                styles.bar,
                                styles.queueBar,
                                { height: queueHeight },
                                bucket.queueCompleted === 0 && styles.barEmpty,
                              ]}
                            />
                          </View>
                          <AppText variant="caption" style={styles.barLabel}>
                            {bucketLabel}
                          </AppText>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.legend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
                      <AppText variant="caption">Reservations</AppText>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendSwatch, { backgroundColor: colors.accent }]} />
                      <AppText variant="caption">Queue pickups</AppText>
                    </View>
                  </View>
                </>
              )}
            </Card>

            <Pressable
              style={styles.footerLink}
              onPress={() =>
                router.push({
                  pathname: '/(manager)/restaurant-info',
                  params: { id: restaurantId },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Restaurant management"
            >
              <View style={styles.managementIcon}>
                <Ionicons name="storefront-outline" size={21} color={colors.primary} />
              </View>
              <View style={styles.footerLinkBody}>
                <AppText variant="label">Restaurant Management</AppText>
                <AppText variant="caption">Manage your restaurant details</AppText>
              </View>
              <View style={styles.chevronCircle}>
                <Ionicons name="chevron-forward" size={17} color={colors.textOnPrimary} />
              </View>
            </Pressable>

            <Pressable
              style={styles.footerLink}
              onPress={() => router.push('/(manager)/offers')}
              accessibilityRole="button"
              accessibilityLabel="Offers and promotions"
            >
              <View style={styles.managementIcon}>
                <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.footerLinkBody}>
                <AppText variant="label">Offers & Promotions</AppText>
                <AppText variant="caption">Manage customer offers and discounts</AppText>
              </View>
              <View style={styles.chevronCircle}>
                <Ionicons name="chevron-forward" size={17} color={colors.textOnPrimary} />
              </View>
            </Pressable>

            <Pressable
              style={styles.footerLink}
              onPress={() => router.push('/(staff)')}
              accessibilityRole="button"
            >
              <Ionicons name="grid-outline" size={16} color={colors.primary} />
              <AppText variant="label" style={styles.footerLinkText}>
                Open staff floor dashboard
              </AppText>
            </Pressable>

            <Pressable
              style={styles.footerLink}
              onPress={() => {
                confirmLogout();
              }}
              disabled={loggingOut}
              accessibilityRole="button"
              accessibilityLabel="Log out of SEAT"
            >
              <Ionicons name="log-out-outline" size={16} color={colors.danger} />
              <AppText variant="label" style={styles.footerLinkDanger}>
                Log out
              </AppText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
  tone = colors.primary,
}: {
  label: string;
  value: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: string;
}) {
  return (
    <Card style={styles.summaryCard}>
      <View style={styles.summaryTop}>
        <AppText variant="caption">{label.toUpperCase()}</AppText>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <AppText variant="display" style={styles.summaryValue}>
        {value}
      </AppText>
      <AppText variant="secondary">{hint}</AppText>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption">{label}</AppText>
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  filter: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary },
  filterTextActive: { color: colors.textOnPrimary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cards: { gap: spacing.md },
  summaryCard: { gap: spacing.xs },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryValue: { fontSize: 34, lineHeight: 40, color: colors.primary },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  detail: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 2,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 140,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  barColumn: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  barGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 96,
  },
  bar: {
    width: '70%',
    maxWidth: 22,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  queueBar: { backgroundColor: colors.accent },
  barEmpty: { backgroundColor: colors.border },
  barValue: { fontSize: 9, color: colors.textSecondary },
  barLabel: { fontSize: 9, color: colors.textMuted },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  managementIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLinkBody: { flex: 1, gap: 2 },
  footerLinkText: { color: colors.primary },
  footerLinkDanger: { color: colors.danger },
});
