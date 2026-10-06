import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LastUpdated,
  RowSkeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchMyBookings, type Booking } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const TABS = ['Upcoming', 'Past'] as const;

/**
 * My Bookings (spec §5) — Upcoming / Past tabs with "Manage reservation".
 */
export default function BookingsScreen() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Upcoming');

  const bookings = useApiQuery(['bookings'], fetchMyBookings);

  const rows = (tab === 'Upcoming'
    ? bookings.data?.data?.upcoming
    : bookings.data?.data?.past) ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title">My bookings</AppText>
        <AppText variant="secondary">
          {tab === 'Upcoming' ? 'Tables you have reserved' : 'Where you’ve eaten with us'}
        </AppText>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((label) => (
          <Pressable
            key={label}
            onPress={() => setTab(label)}
            style={[styles.tab, tab === label && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === label }}
          >
            <AppText
              variant="label"
              style={[styles.tabLabel, tab === label && styles.tabLabelActive]}
            >
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LastUpdated timestamp={bookings.data?.lastUpdated} />

        {bookings.isLoading ? (
          <RowSkeleton count={3} />
        ) : bookings.isError ? (
          <ErrorState
            message={apiErrorMessage(bookings.error)}
            onRetry={() => bookings.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title={tab === 'Upcoming' ? 'No upcoming bookings' : 'Nothing here yet'}
            message={
              tab === 'Upcoming'
                ? 'When you reserve a table it will show up here, ready to manage.'
                : 'Past bookings appear here after your visit.'
            }
            glyph="📅"
            action={
              tab === 'Upcoming' ? (
                <Button
                  label="Find a table"
                  onPress={() => router.push('/(tabs)/explore')}
                  style={styles.emptyAction}
                />
              ) : undefined
            }
          />
        ) : (
          <View style={styles.list}>
            {rows.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  const tone =
    booking.status === 'cancelled' || booking.status === 'no-show'
      ? 'danger'
      : booking.status === 'checked-in'
        ? 'success'
        : 'neutral';

  const dateLabel = new Date(booking.date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <AppText variant="heading" numberOfLines={1}>
            {booking.restaurant?.name ?? 'Restaurant'}
          </AppText>
          <AppText variant="secondary">
            {dateLabel} · {formatTime(booking.time)} · {booking.partySize} guests
          </AppText>
        </View>
        <Badge label={booking.status} tone={tone} />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
          <AppText variant="caption">{booking.bookingId}</AppText>
        </View>
        <View style={styles.meta}>
          <Ionicons name="grid-outline" size={14} color={colors.textSecondary} />
          <AppText variant="caption">
            {booking.tableNumber ? `Table ${booking.tableNumber}` : 'Table assigned on arrival'}
          </AppText>
        </View>
      </View>

      <View style={styles.cardActions}>
        <Button
          label="Receipt"
          variant="ghost"
          onPress={() => router.push(`/bookings/${booking.id}/receipt` as any)}
          accessibilityLabel={`View receipt for ${booking.bookingId}`}
          style={styles.cardReceiptBtn}
        />
        <Button
          label="Manage reservation"
          variant="secondary"
          onPress={() => router.push(`/bookings/${booking.id}`)}
          accessibilityLabel={`Manage reservation ${booking.bookingId}`}
          style={styles.cardManageBtn}
        />
      </View>
    </Card>
  );
}

export function formatTime(time?: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 2 },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabLabel: { color: colors.textSecondary },
  tabLabelActive: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  list: { gap: spacing.lg },
  card: { gap: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleBlock: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  cardReceiptBtn: { flex: 1 },
  cardManageBtn: { flex: 2 },
  emptyAction: { marginTop: spacing.md, minWidth: 200 },
});
