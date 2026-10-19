import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  InfoBox,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { isPastReservationDateTime } from '@/components/ReservationTimeRangePicker';
import { apiErrorMessage, createBooking, fetchRestaurant } from '@/services/api';
import { parseSlotUnavailable } from '@/services/api/reservations.api';
import { colors, radius, spacing } from '@/theme';

function minutesToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeStrToMinutes(time: string): number {
  const [h, m] = (time || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatTime(time?: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
}

export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    restaurantId: string;
    restaurantName?: string;
    partySize: string;
    date: string;
    time?: string;
    startTime?: string;
    endTime?: string;
    specialRequest?: string;
    tableId?: string;
    tableNumber?: string;
    tableCapacity?: string;
    hourlyRate?: string;
    reservationFee?: string;
    durationMinutes?: string;
    cart?: string;
    foodTotal?: string;
  }>();
  const { showToast } = useFeedback();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<{ time: string; label: string }[]>([]);

  let foodItems: { menuItemId?: string; id?: string; _id?: string; name: string; price: number; quantity: number; note?: string }[] = [];
  try {
    foodItems = JSON.parse(params.cart || '[]');
  } catch {
    foodItems = [];
  }
  const foodTotal = foodItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const tableFee = Number(params.reservationFee || 0);
  const grandTotal = tableFee + foodTotal;

  const partySize = Number(params.partySize) || 2;
  const startTime = params.startTime || params.time || '';
  const endTime = params.endTime || '';

  const startMin = timeStrToMinutes(startTime);
  const endMin = timeStrToMinutes(endTime);
  const durationMin = Math.max(30, endMin - startMin);
  const durationHours = Math.floor(durationMin / 60);
  const remainingMins = durationMin % 60;
  const durationLabel =
    durationHours > 0 && remainingMins > 0
      ? `${durationHours} hr ${remainingMins} min`
      : durationHours > 0
        ? `${durationHours} hour${durationHours > 1 ? 's' : ''}`
        : `${remainingMins} minutes`;

  const bufferEndMin = endMin + 30;
  const bufferEndTimeStr = minutesToTimeStr(bufferEndMin);

  const restaurantQuery = useApiQuery(
    ['restaurant', params.restaurantId],
    () => fetchRestaurant(params.restaurantId!, { partySize, date: params.date }),
    { enabled: Boolean(params.restaurantId) },
  );

  const restaurant = restaurantQuery.data?.data;

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    setAlternatives([]);

    if (!startTime || !endTime) {
      setError('Please select valid start and end times for your reservation.');
      showToast('Start and end times are required.', 'error');
      setSubmitting(false);
      return;
    }

    if (isPastReservationDateTime(params.date, startTime)) {
      setError('The selected reservation time has already passed. Please go back and choose a future time.');
      showToast('Reservation time has passed.', 'error');
      setSubmitting(false);
      return;
    }

    try {
      const result = await createBooking({
        restaurantId: params.restaurantId,
        date: params.date,
        startTime,
        endTime,
        time: startTime,
        partySize,
        specialRequest: params.specialRequest || undefined,
        tableId: params.tableId || undefined,
        items: foodItems.length > 0
          ? foodItems.map((item) => ({
              menuItemId: item.menuItemId || item.id || item._id || '',
              name: item.name,
              price: item.price,
              quantity: item.quantity,
              note: item.note,
            }))
          : undefined,
        preOrderNotes: params.specialRequest || undefined,
      });

      router.replace({
        pathname: '/reserve/confirmed',
        params: {
          bookingId: result.data?.reservation.bookingId ?? '',
          reservationId: result.data?.reservation.id ?? '',
          tableNumber: params.tableNumber ?? '',
          reservationFee: params.reservationFee ?? '',
          date: params.date,
          timeRange: `${formatTime(startTime)} – ${formatTime(endTime)}`,
          foodTotal: String(foodTotal),
          foodCount: String(foodItems.reduce((acc, i) => acc + i.quantity, 0)),
        },
      });
    } catch (caught) {
      const slotError = parseSlotUnavailable(caught);
      if (slotError) {
        setError(slotError.message);
        setAlternatives(slotError.alternatives);
      } else if (
        (caught as { response?: { status?: number } }).response?.status === 401
      ) {
        showToast('Please sign in before confirming your reservation.', 'error');
        router.replace('/(auth)/login');
        return;
      } else {
        setError(apiErrorMessage(caught));
      }
      showToast('Booking not confirmed yet.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const dateLabel = new Date(`${params.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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
          <AppText variant="label">Review Reservation</AppText>
          <AppText variant="caption">Step 2 of 2 · Confirm & Pay</AppText>
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <AppText variant="title">{restaurant?.name ?? params.restaurantName}</AppText>
          <AppText variant="secondary">{restaurant?.address}</AppText>

          <View style={styles.summary}>
            <Row icon="calendar-outline" label="Date" value={dateLabel} />
            <Row
              icon="time-outline"
              label="Time Range"
              value={`${formatTime(startTime)} – ${formatTime(endTime)}`}
            />
            <Row icon="hourglass-outline" label="Duration" value={durationLabel} />
            <Row
              icon="people-outline"
              label="Party Size"
              value={`${partySize} guest${partySize === 1 ? '' : 's'}`}
            />
            <Row
              icon="grid-outline"
              label="Table"
              value={
                params.tableNumber
                  ? `Table ${params.tableNumber}${params.tableCapacity ? ` (${params.tableCapacity} seats)` : ''}`
                  : 'Selected Table'
              }
            />
            <Row
              icon="pricetag-outline"
              label="Hourly Rate"
              value={`Rs. ${params.hourlyRate || 300} / hour`}
            />
            <Row
              icon="wallet-outline"
              label="Table Fee"
              value={`Rs. ${tableFee}`}
            />
            {foodTotal > 0 ? (
              <Row
                icon="fast-food-outline"
                label="Food Pre-order"
                value={`Rs. ${foodTotal}`}
              />
            ) : null}
            <Row
              icon="cash-outline"
              label="Grand Total"
              value={`Rs. ${grandTotal}`}
              highlight
            />
            {params.specialRequest ? (
              <Row icon="chatbubble-ellipses-outline" label="Special Request" value={params.specialRequest} />
            ) : null}
          </View>
        </Card>

        {foodItems.length > 0 ? (
          <Card>
            <View style={styles.cardHeaderRow}>
              <AppText variant="title">Pre-ordered Food</AppText>
              <Badge
                label={`${foodItems.reduce((acc, i) => acc + i.quantity, 0)} items`}
                tone="accent"
              />
            </View>

            <View style={styles.foodList}>
              {foodItems.map((item, idx) => (
                <View key={idx} style={styles.foodItemRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium" style={{ fontWeight: '600' }}>
                      {item.quantity}× {item.name}
                    </AppText>
                    {item.note ? (
                      <AppText variant="caption" style={{ color: colors.textMuted }}>
                        Note: {item.note}
                      </AppText>
                    ) : null}
                  </View>
                  <AppText variant="bodyMedium" style={{ fontWeight: '600' }}>
                    Rs. {item.price * item.quantity}
                  </AppText>
                </View>
              ))}

              <View style={styles.foodDivider} />

              <View style={styles.foodTotalRow}>
                <AppText variant="label">Food Subtotal</AppText>
                <AppText variant="label" style={{ color: colors.primary }}>
                  Rs. {foodTotal}
                </AppText>
              </View>
            </View>
          </Card>
        ) : null}

        {/* 30-min turnaround buffer notice (Section 5, 11) */}
        <InfoBox tone="info">
          <AppText variant="label">Turnaround Buffer Included</AppText>
          <AppText variant="secondary">
            A mandatory 30-minute preparation buffer ({formatTime(endTime)} – {formatTime(bufferEndTimeStr)}) is
            automatically blocked after your reservation for table sanitisation and resetting. You are NOT charged for this buffer.
          </AppText>
        </InfoBox>

        {/* Cancellation Policy (Section 11) */}
        <InfoBox tone="warning">
          <AppText variant="label">Cancellation Policy</AppText>
          <AppText variant="secondary">
            Cancellations must be requested at least 24 hours prior to reservation time and require staff review.
            Late cancellations within 24 hours or no-shows are subject to review.
          </AppText>
        </InfoBox>

        {error ? (
          <InfoBox tone="danger">
            <AppText variant="label">{error}</AppText>
            {alternatives.length > 0 ? (
              <>
                <AppText variant="secondary">
                  That slot was just booked. Pick one of these alternatives instead:
                </AppText>
                <View style={styles.altRow}>
                  {alternatives.map((slot) => (
                    <Pressable
                      key={slot.time}
                      onPress={() => {
                        router.setParams({ startTime: slot.time, time: slot.time });
                        setError(null);
                        setAlternatives([]);
                      }}
                      style={styles.altChip}
                    >
                      <AppText variant="label" style={styles.altText}>
                        {slot.label}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </InfoBox>
        ) : null}

        <Button
          label={`Confirm reservation · Rs. ${grandTotal}`}
          onPress={onConfirm}
          loading={submitting}
          testID="confirm-reservation"
        />
        <Button label="Change details" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <AppText variant="secondary" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText
        variant={highlight ? 'heading' : 'bodyMedium'}
        style={[styles.rowValue, highlight && styles.rowValueHighlight]}
      >
        {value}
      </AppText>
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
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  summary: { gap: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { width: 110 },
  rowValue: { flex: 1, textAlign: 'right' },
  rowValueHighlight: { color: colors.primary, fontSize: 18 },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  altChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  altText: { color: colors.primary },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  foodList: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  foodItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  foodDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  foodTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
});
