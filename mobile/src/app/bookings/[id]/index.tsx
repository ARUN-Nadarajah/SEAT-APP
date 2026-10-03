import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  InfoBox,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  cancelBooking,
  fetchBooking,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

/**
 * Reservation Details (spec §5): Change / Cancel sit directly on the screen.
 * Cancelling requires a confirmation dialog (FR07 + spec §9 error prevention).
 */
export default function ReservationDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { confirm, showToast } = useFeedback();

  const query = useApiQuery(['booking', id], () => fetchBooking(id!), {
    enabled: Boolean(id),
  });

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header />
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton height={24} width="60%" />
          <Skeleton height={160} radius={radius.lg} />
          <Skeleton height={56} radius={radius.lg} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header />
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const booking = query.data.data.reservation;
  const closed = ['cancelled', 'completed', 'no-show'].includes(booking.status);

  async function onCancel() {
    const accepted = await confirm({
      title: 'Cancel this reservation?',
      message:
        'Your table will be released for other guests. This can’t be undone — you’d need to book again.',
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'Keep my booking',
      destructive: true,
    });
    if (!accepted) return;

    try {
      await cancelBooking(booking.id, 'Cancelled by guest');
      router.replace({ pathname: '/bookings/cancelled', params: { bookingId: booking.bookingId } });
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  const dateLabel = new Date(booking.date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <AppText variant="title">{booking.restaurant?.name}</AppText>
            <AppText variant="secondary">{booking.restaurant?.address}</AppText>
          </View>
          <Badge
            label={booking.status}
            tone={
              booking.status === 'cancelled' || booking.status === 'no-show'
                ? 'danger'
                : booking.status === 'checked-in'
                  ? 'success'
                  : 'neutral'
            }
          />
        </View>

        <Card>
          <AppText variant="caption">BOOKING REFERENCE</AppText>
          <AppText variant="display" style={styles.reference}>
            {booking.bookingId}
          </AppText>

          <View style={styles.detailList}>
            <Detail icon="calendar-outline" label="Date" value={dateLabel} />
            <Detail icon="time-outline" label="Time" value={formatTime(booking.time)} />
            <Detail
              icon="people-outline"
              label="Party"
              value={`${booking.partySize} guest${booking.partySize === 1 ? '' : 's'}`}
            />
            <Detail
              icon="grid-outline"
              label="Table"
              value={booking.tableNumber || 'Assigned on arrival'}
            />
            {booking.specialRequest ? (
              <Detail icon="chatbubble-ellipses-outline" label="Note" value={booking.specialRequest} />
            ) : null}
          </View>
        </Card>

        {booking.checkedInAt ? (
          <InfoBox tone="success">
            <AppText variant="label">Checked in</AppText>
            <AppText variant="secondary">
              You arrived at{' '}
              {new Date(booking.checkedInAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Enjoy your meal.
            </AppText>
          </InfoBox>
        ) : null}

        {booking.status === 'cancelled' ? (
          <InfoBox tone="danger">
            <AppText variant="label">This booking was cancelled</AppText>
            <AppText variant="secondary">
              Nothing further to do — book again whenever you like.
            </AppText>
          </InfoBox>
        ) : null}

        {/* FR07 — change and cancel directly available */}
        {!closed ? (
          <View style={styles.actions}>
            <Button
              label="Change reservation"
              onPress={() =>
                router.push({
                  pathname: '/bookings/[id]/change',
                  params: { id: booking.id },
                })
              }
              testID="change-reservation"
            />
            <Button
              label="Cancel reservation"
              variant="danger"
              onPress={onCancel}
              testID="cancel-reservation"
            />
          </View>
        ) : (
          <Button
            label="Book another table"
            onPress={() => router.replace('/(tabs)/explore')}
          />
        )}

        <Button label="Back to bookings" variant="ghost" onPress={() => router.replace('/(tabs)/bookings')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <AppText variant="secondary" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

function Header() {
  return (
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
      <AppText variant="label">Reservation</AppText>
      <View style={styles.back} />
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  titleBlock: { flex: 1, gap: 2 },
  reference: { color: colors.primary, letterSpacing: 1.5 },
  detailList: { gap: spacing.md, marginTop: spacing.md },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailLabel: { width: 64 },
  detailValue: { flex: 1, textAlign: 'right' },
  actions: { gap: spacing.sm },
});
