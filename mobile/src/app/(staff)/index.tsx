import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
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
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoBox,
  LastUpdated,
  RowSkeleton,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
  callNextParty,
  checkInBooking,
  fetchRestaurants,
  fetchStaffQueue,
  fetchStaffReservations,
  fetchTables,
  removeFromQueue,
  seatParty,
  updateTableStatus,
  type TableStatus,
} from '@/services/api';
import { onTableUpdated, onQueueUpdated } from '@/services/realtime/socket';
import { colors, radius, spacing } from '@/theme';

type Panel = 'tables' | 'reservations' | 'queue';

const PANELS: { key: Panel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tables', label: 'Tables', icon: 'grid-outline' },
  { key: 'reservations', label: 'Bookings', icon: 'calendar-outline' },
  { key: 'queue', label: 'Queue', icon: 'people-outline' },
];

const TABLE_CYCLE: TableStatus[] = ['available', 'occupied', 'reserved'];

/**
 * Staff Dashboard (spec §5 / FR08 / FR09).
 *
 * Three panels behind one segmented control: table grid, today's
 * reservations with search + check-in, and the live queue with call-next.
 */
export default function StaffDashboardScreen() {
  const { user } = useAuth();
  const { showToast } = useFeedback();
  const [panel, setPanel] = useState<Panel>('tables');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [liveAt, setLiveAt] = useState<string | null>(null);

  // Resolve the venue this staff member works at (spec §2).
  const venueQuery = useApiQuery(['staff-venue', user?.restaurantId], async () => {
    if (user?.restaurantId) {
      const all = await fetchRestaurants({ limit: 100 });
      return all.data?.find((r) => r.id === user.restaurantId) ?? all.data?.[0] ?? null;
    }
    const all = await fetchRestaurants({ limit: 100 });
    return all.data?.[0] ?? null;
  });

  const restaurantId = venueQuery.data?.id ?? user?.restaurantId ?? '';

  const tables = useApiQuery(
    ['tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId) },
  );

  const reservations = useApiQuery(
    ['staff-reservations', restaurantId, search],
    () =>
      fetchStaffReservations({
        restaurantId,
        date: new Date().toISOString().slice(0, 10),
        q: search.trim() || undefined,
      }),
    { enabled: Boolean(restaurantId) },
  );

  const queue = useApiQuery(['staff-queue', restaurantId], () =>
    fetchStaffQueue(restaurantId),
  );

  const markLive = useCallback(() => setLiveAt(new Date().toISOString()), []);

  // FR05/FR08 — live floor updates while the dashboard is open.
  useEffect(() => {
    if (!restaurantId) return;
    const offTables = onTableUpdated(restaurantId, () => {
      tables.refetch();
      markLive();
    });
    const offQueue = onQueueUpdated(restaurantId, () => {
      queue.refetch();
      markLive();
    });
    return () => {
      offTables();
      offQueue();
    };
  }, [restaurantId, tables.refetch, queue.refetch, markLive]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([tables.refetch(), reservations.refetch(), queue.refetch()]);
    setRefreshing(false);
  }

  async function toggleTable(id: string, current: TableStatus) {
    const next = TABLE_CYCLE[(TABLE_CYCLE.indexOf(current) + 1) % TABLE_CYCLE.length];
    try {
      await updateTableStatus(id, next);
      tables.refetch();
      markLive();
      showToast(`Table marked ${next}.`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onCheckIn(bookingId: string) {
    try {
      await checkInBooking(bookingId, restaurantId);
      reservations.refetch();
      showToast('Guest checked in.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onCallNext() {
    try {
      const result = await callNextParty(restaurantId);
      queue.refetch();
      tables.refetch();
      router.push({
        pathname: '/(staff)/notified',
        params: {
          queueCode: result.data?.queueCode ?? '',
          tableNumber: result.data?.tableNumber ?? '',
          guestName: result.data?.guestName ?? '',
          partySize: String(result.data?.partySize ?? ''),
        },
      });
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onSeat(entryId: string) {
    try {
      await seatParty(entryId, restaurantId);
      queue.refetch();
      tables.refetch();
      showToast('Party seated.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onRemove(entryId: string) {
    try {
      await removeFromQueue(entryId, restaurantId, 'no-show');
      queue.refetch();
      showToast('Removed from queue.', 'info');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  const summary = tables.data?.summary;
  const waitingCount = queue.data?.data?.filter((row) => row.status === 'waiting').length ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="caption">STAFF DASHBOARD</AppText>
          <AppText variant="title" numberOfLines={1}>
            {venueQuery.data?.name ?? 'Loading venue…'}
          </AppText>
        </View>
        <Pressable
          style={styles.bell}
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Floor summary */}
      <View style={styles.statRow}>
        <Stat label="Free" value={summary?.available ?? 0} tone="success" />
        <Stat label="Seated" value={summary?.occupied ?? 0} tone="neutral" />
        <Stat label="Held" value={summary?.reserved ?? 0} tone="warning" />
        <Stat label="Waiting" value={waitingCount} tone="accent" />
      </View>

      {/* Panel switcher */}
      <View style={styles.panels}>
        {PANELS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setPanel(item.key)}
            style={[styles.panel, panel === item.key && styles.panelActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: panel === item.key }}
          >
            <Ionicons
              name={item.icon}
              size={16}
              color={panel === item.key ? colors.textOnPrimary : colors.textSecondary}
            />
            <AppText
              variant="label"
              style={panel === item.key ? styles.panelTextActive : styles.panelText}
            >
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <LastUpdated
          timestamp={liveAt ?? tables.data?.lastUpdated}
          live
          label={liveAt ? 'Live · updated just now' : undefined}
        />

        {/* --- FR08: table status grid --- */}
        {panel === 'tables' ? (
          tables.isLoading ? (
            <View style={styles.grid}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} height={86} radius={radius.md} />
              ))}
            </View>
          ) : tables.isError ? (
            <ErrorState message={apiErrorMessage(tables.error)} onRetry={() => tables.refetch()} />
          ) : (tables.data?.data?.length ?? 0) === 0 ? (
            <EmptyState title="No tables yet" message="Ask your manager to seed the floor plan." glyph="🪑" />
          ) : (
            <>
              <InfoBox tone="info">
                <AppText variant="secondary">
                  Tap a table to cycle Available → Occupied → Reserved. Changes
                  appear on every open dashboard instantly.
                </AppText>
              </InfoBox>
              <View style={styles.grid}>
                {(tables.data?.data ?? []).map((table) => (
                  <Pressable
                    key={table.id}
                    onPress={() => toggleTable(table.id, table.status)}
                    style={[
                      styles.tableCell,
                      table.status === 'occupied' && styles.tableOccupied,
                      table.status === 'reserved' && styles.tableReserved,
                      table.status === 'maintenance' && styles.tableMaintenance,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Table ${table.tableNumber}, ${table.status}. Double tap to change.`}
                  >
                    <AppText
                      variant="heading"
                      style={
                        table.status === 'available' ? undefined : styles.tableCellTextInverse
                      }
                    >
                      {table.tableNumber}
                    </AppText>
                    <AppText
                      variant="caption"
                      style={
                        table.status === 'available' ? undefined : styles.tableCellTextInverse
                      }
                    >
                      {table.capacity} seats
                    </AppText>
                    <AppText
                      variant="caption"
                      style={
                        table.status === 'available' ? undefined : styles.tableCellTextInverse
                      }
                    >
                      {table.status}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </>
          )
        ) : null}

        {/* --- FR09: today's reservations with search + check-in --- */}
        {panel === 'reservations' ? (
          <>
            <View style={styles.searchShell}>
              <Ionicons name="search" size={17} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, booking ID or table"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search reservations"
              />
            </View>

            {reservations.isLoading ? (
              <RowSkeleton count={3} />
            ) : reservations.isError ? (
              <ErrorState
                message={apiErrorMessage(reservations.error)}
                onRetry={() => reservations.refetch()}
              />
            ) : (reservations.data?.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No bookings today"
                message={search ? 'Nothing matches that search.' : 'A quiet day — enjoy it.'}
                glyph="🗓"
              />
            ) : (
              <View style={styles.list}>
                {(reservations.data?.data ?? []).map((booking) => (
                  <Card key={booking.id} style={styles.bookingCard}>
                    <View style={styles.bookingTop}>
                      <View style={styles.bookingTitleBlock}>
                        <AppText variant="bodyMedium">
                          {booking.guest?.name || booking.guestName || 'Guest'}
                        </AppText>
                        <AppText variant="caption">
                          {booking.time} · {booking.partySize} guests ·{' '}
                          {booking.tableNumber ? `Table ${booking.tableNumber}` : 'unassigned'} ·{' '}
                          {booking.bookingId}
                        </AppText>
                      </View>
                      <Badge
                        label={booking.status}
                        tone={booking.status === 'checked-in' ? 'success' : 'neutral'}
                      />
                    </View>

                    {booking.status === 'confirmed' ? (
                      <Button
                        label="Check in"
                        onPress={() => onCheckIn(booking.id)}
                        accessibilityLabel={`Check in ${booking.bookingId}`}
                      />
                    ) : null}
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}

        {/* --- FR09/Fr06: queue management --- */}
        {panel === 'queue' ? (
          queue.isLoading ? (
            <RowSkeleton count={3} />
          ) : queue.isError ? (
            <ErrorState message={apiErrorMessage(queue.error)} onRetry={() => queue.refetch()} />
          ) : (queue.data?.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nobody waiting"
              message="The queue is empty. Call next as soon as a party joins."
              glyph="⏳"
            />
          ) : (
            <>
              <Button
                label={`Call next party${waitingCount ? ` (${waitingCount})` : ''}`}
                onPress={onCallNext}
                disabled={waitingCount === 0}
                testID="call-next"
              />

              <View style={styles.list}>
                {(queue.data?.data ?? []).map((row) => (
                  <Card key={row.id} style={styles.queueCard}>
                    <View style={styles.bookingTop}>
                      <View style={styles.bookingTitleBlock}>
                        <AppText variant="bodyMedium">
                          {row.position}. {row.guestName}
                        </AppText>
                        <AppText variant="caption">
                          {row.queueCode} · party of {row.partySize} · {row.estimateLabel}
                        </AppText>
                      </View>
                      <Badge
                        label={row.status}
                        tone={
                          row.status === 'notified'
                            ? 'success'
                            : row.status === 'seated'
                              ? 'accent'
                              : 'neutral'
                        }
                      />
                    </View>

                    <View style={styles.queueActions}>
                      {row.status === 'waiting' || row.status === 'notified' ? (
                        <Button
                          label="Seat"
                          variant="secondary"
                          onPress={() => onSeat(row.id)}
                          style={styles.queueAction}
                        />
                      ) : null}
                      {row.status !== 'seated' ? (
                        <Button
                          label="Remove"
                          variant="danger"
                          onPress={() => onRemove(row.id)}
                          style={styles.queueAction}
                        />
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            </>
          )
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Switch account"
          variant="ghost"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'neutral' | 'warning' | 'accent';
}) {
  return (
    <View style={[styles.stat, statTones[tone]]}>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
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
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: 2,
  },
  panels: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  panel: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  panelText: { color: colors.textSecondary },
  panelTextActive: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  footer: { padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tableCell: {
    width: '31%',
    minWidth: 100,
    minHeight: 86,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.infoBox,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: spacing.sm,
  },
  tableOccupied: { backgroundColor: colors.primary, borderColor: colors.primary },
  tableReserved: { backgroundColor: colors.warning, borderColor: colors.warning },
  tableMaintenance: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  tableCellTextInverse: { color: colors.textOnPrimary },
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
  list: { gap: spacing.md },
  bookingCard: { gap: spacing.sm },
  bookingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bookingTitleBlock: { flex: 1, gap: 2 },
  queueCard: { gap: spacing.sm },
  queueActions: { flexDirection: 'row', gap: spacing.sm },
  queueAction: { flex: 1 },
});

const statTones = StyleSheet.create({
  success: { backgroundColor: colors.infoBox },
  neutral: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  warning: { backgroundColor: colors.warningBox },
  accent: { backgroundColor: colors.accent },
});
