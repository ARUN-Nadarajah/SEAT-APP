import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  InfoBox,
  LastUpdated,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
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
 * Manager View (FR10): summary cards — total reservations, no-shows, average
 * wait — plus a date filter and a simple reservations-by-hour chart.
 */
export default function ManagerDashboardScreen() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>('today');
  const [refreshing, setRefreshing] = useState(false);

  // Date is state, not computed during render (React compiler: purity).
  const [dateParam, setDateParam] = useState(() => todayString(0));

  function selectRange(next: Range) {
    setRange(next);
    setDateParam(todayString(next === 'yesterday' ? 1 : 0));
  }

  const venueQuery = useApiQuery(['manager-venue'], async () => {
    const all = await fetchRestaurants({ limit: 100 });
    return all.data?.find((r) => r.id === user?.restaurantId) ?? all.data?.[0] ?? null;
  });

  const restaurantId = venueQuery.data?.id ?? user?.restaurantId ?? '';

  const stats = useApiQuery(
    ['manager-stats', restaurantId, dateParam],
    () => fetchManagerStats(restaurantId, dateParam),
    { enabled: Boolean(restaurantId) },
  );

  async function onRefresh() {
    setRefreshing(true);
    await stats.refetch();
    setRefreshing(false);
  }

  const data = stats.data?.data;
  const hourly = stats.data?.hourly ?? [];
  const peak = Math.max(1, ...hourly.map((bucket) => bucket.reservations));

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
        {/* Date filter */}
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
        ) : !data ? (
          <EmptyState
            title="No figures yet"
            message="Once reservations start coming in, your summary will appear here."
            glyph="📊"
          />
        ) : (
          <>
            {/* Summary cards (FR10) */}
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
                label="Avg wait"
                value={data.avgWaitLabel}
                hint={`${data.walkIns} seated from queue`}
                icon="hourglass-outline"
                tone={colors.warning}
              />
            </View>

            <Card>
              <SectionTitle>Operational detail</SectionTitle>
              <View style={styles.detailGrid}>
                <Detail label="Checked in" value={String(data.checkedIn)} />
                <Detail label="Still expected" value={String(data.confirmed)} />
                <Detail label="Avg party size" value={String(data.avgPartySize)} />
                <Detail label="Free tables" value={String(data.tableSummary.available)} />
              </View>
            </Card>

            {/* Simple chart (FR10) */}
            <Card>
              <SectionTitle>Reservations by hour</SectionTitle>
              <AppText variant="secondary">
                {data.date} · bars show bookings, the line shows average wait
              </AppText>

              {hourly.length === 0 ? (
                <InfoBox tone="info">
                  <AppText variant="secondary">
                    No activity logged for this day yet.
                  </AppText>
                </InfoBox>
              ) : (
                <>
                  <View style={styles.chart}>
                    {hourly.map((bucket) => {
                      const height = Math.max(4, Math.round((bucket.reservations / peak) * 96));
                      return (
                        <View key={bucket.hour} style={styles.barColumn}>
                          <AppText variant="caption" style={styles.barValue}>
                            {bucket.reservations || ''}
                          </AppText>
                          <View
                            style={[
                              styles.bar,
                              { height },
                              bucket.reservations === 0 && styles.barEmpty,
                            ]}
                          />
                          <AppText variant="caption" style={styles.barLabel}>
                            {bucket.label}
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
                      <AppText variant="caption">
                        Avg wait · {data.avgWaitLabel}
                      </AppText>
                    </View>
                  </View>
                </>
              )}
            </Card>

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
              onPress={() => router.push('/(auth)/login')}
              accessibilityRole="button"
            >
              <Ionicons name="log-out-outline" size={16} color={colors.danger} />
              <AppText variant="label" style={styles.footerLinkDanger}>
                Switch account
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
  bar: {
    width: '70%',
    maxWidth: 22,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  barEmpty: { backgroundColor: colors.border },
  barValue: { fontSize: 9, color: colors.textSecondary },
  barLabel: { fontSize: 9, color: colors.textMuted },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footerLinkText: { color: colors.primary },
  footerLinkDanger: { color: colors.danger },
});
