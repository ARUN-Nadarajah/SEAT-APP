import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  InfoBox,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchBooking,
  requestCancellation,
  type Booking,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

/**
 * Reservation Details (spec §5): Change / Cancel sit directly on the screen.
 * Cancelling requires a non-empty reason and staff approval (FR07).
 */
export default function ReservationDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useFeedback();

  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

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

  const rawData = query.data?.data as Record<string, any> | undefined;
  const booking = (rawData?.reservation ?? rawData) as Booking | undefined;

  if (query.isError || !booking || !booking.status) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header />
        <ErrorState
          message={apiErrorMessage(query.error) || 'Reservation details unavailable.'}
          onRetry={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const isPendingCancellation = booking.status === 'cancellation_pending';
  const closed = ['cancelled', 'completed', 'no-show'].includes(booking.status);

  const dateLabel = new Date(booking.date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const reservationDateTime = booking.startDateTime
    ? new Date(booking.startDateTime)
    : new Date(`${booking.date.slice(0, 10)}T${booking.startTime || booking.time || '12:00'}:00`);
  const hoursUntilReservation = (reservationDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
  const isWithin24Hours = hoursUntilReservation < 24 && hoursUntilReservation > 0;

  const isPast = Boolean(
    booking.isPast ||
    closed ||
    (reservationDateTime.getTime() < Date.now())
  );
  const canEdit = Boolean(
    (booking.canEdit ?? !isPast) &&
    !isPast &&
    !isPendingCancellation &&
    !closed
  );

  async function onSubmitCancellation() {
    const trimmed = cancellationReason.trim();
    if (!trimmed) {
      setReasonError('Please provide a reason for cancellation.');
      return;
    }
    setSubmittingCancellation(true);
    setReasonError(null);

    try {
      await requestCancellation(booking!.id, trimmed);
      setCancelModalVisible(false);
      showToast('Cancellation request submitted for staff review.', 'success');
      await query.refetch();
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    } finally {
      setSubmittingCancellation(false);
    }
  }

  const timeRangeLabel = booking.endTime
    ? `${formatTime(booking.startTime || booking.time)} – ${formatTime(booking.endTime)}`
    : formatTime(booking.time);

  const durationLabel = booking.durationMinutes
    ? `${Math.floor(booking.durationMinutes / 60)} hr${Math.floor(booking.durationMinutes / 60) > 1 ? 's' : ''}${booking.durationMinutes % 60 ? ` ${booking.durationMinutes % 60} min` : ''}`
    : '';

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
            label={
              booking.status === 'cancellation_pending'
                ? 'Cancellation Pending Review'
                : booking.status
            }
            tone={
              booking.status === 'cancellation_pending'
                ? 'warning'
                : booking.status === 'cancelled' || booking.status === 'no-show'
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
            <Detail icon="time-outline" label="Time" value={timeRangeLabel} />
            {durationLabel ? (
              <Detail icon="hourglass-outline" label="Duration" value={durationLabel} />
            ) : null}
            <Detail
              icon="people-outline"
              label="Party"
              value={`${booking.partySize} guest${booking.partySize === 1 ? '' : 's'}`}
            />
            <Detail
              icon="grid-outline"
              label="Table"
              value={
                booking.tableNumber
                  ? `Table ${booking.tableNumber}${booking.tableCapacity ? ` (${booking.tableCapacity} seats)` : ''}`
                  : 'Assigned on arrival'
              }
            />
            {booking.reservationFee !== undefined ? (
              <Detail
                icon="wallet-outline"
                label="Fee"
                value={`Rs. ${booking.reservationFee}${booking.hourlyRate ? ` (Rs. ${booking.hourlyRate}/hr)` : ''}`}
              />
            ) : null}
            {booking.specialRequest ? (
              <Detail icon="chatbubble-ellipses-outline" label="Note" value={booking.specialRequest} />
            ) : null}
          </View>
        </Card>

        {/* 30-min buffer notice */}
        <InfoBox tone="info">
          <AppText variant="caption">
            Includes a 30-minute preparation buffer after your reservation for table sanitisation and resetting.
          </AppText>
        </InfoBox>

        {/* Cancellation deadline notice */}
        {!closed && !isPendingCancellation ? (
          isWithin24Hours ? (
            <InfoBox tone="warning">
              <AppText variant="label">Within 24 hours of reservation</AppText>
              <AppText variant="secondary">
                Cancellation deadline (24 hours in advance) has passed. Requests submitted now are subject to strict staff review.
              </AppText>
            </InfoBox>
          ) : (
            <InfoBox tone="info">
              <AppText variant="caption">
                Cancellations must be requested at least 24 hours before your booking time and require staff review.
              </AppText>
            </InfoBox>
          )
        ) : null}

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
            <Button
              label="Order food"
              onPress={() =>
                router.push({
                  pathname: '/restaurant/menu',
                  params: {
                    orderType: 'dine-in',
                    reservationId: booking.id,
                    tableId: (booking as Booking & { tableId?: string }).tableId,
                  },
                })
              }
            />
          </InfoBox>
        ) : null}

        {booking.status === 'cancellation_pending' ? (
          <InfoBox tone="warning">
            <AppText variant="label">Cancellation Pending Review</AppText>
            <AppText variant="secondary">
              Your cancellation request has been submitted and is awaiting staff review. Your reservation and table remain held until reviewed.
            </AppText>
            {booking.cancellationReason ? (
              <AppText variant="caption" style={styles.reasonText}>
                Reason: {booking.cancellationReason}
              </AppText>
            ) : null}
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

        {/* Pre-ordered Food */}
        {booking.preOrderItems && booking.preOrderItems.length > 0 ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs }}>
              <Ionicons name="fast-food-outline" size={18} color={colors.primary} />
              <AppText variant="heading">Pre-ordered Food</AppText>
            </View>
            <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {booking.preOrderItems.map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyMedium" style={{ fontWeight: '600' }}>
                      {item.quantity}× {item.name}
                    </AppText>
                    {item.note ? (
                      <AppText variant="caption" style={{ color: colors.textSecondary }}>Note: {item.note}</AppText>
                    ) : null}
                  </View>
                  <AppText variant="label">
                    LKR {(item.totalAmount || item.price * item.quantity).toLocaleString()}
                  </AppText>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText variant="heading">Food Total</AppText>
                <AppText variant="heading" style={{ color: colors.primary }}>
                  LKR {(booking.preOrderTotal || 0).toLocaleString()}
                </AppText>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Past reservation note */}
        {isPast && !isPendingCancellation && booking.status !== 'cancelled' ? (
          <InfoBox tone="info">
            <AppText variant="label">Past reservation</AppText>
            <AppText variant="secondary">
              This reservation has passed and can no longer be edited or cancelled.
            </AppText>
          </InfoBox>
        ) : null}

        {/* View Receipt Document */}
        <Button
          label="View Reservation Receipt"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/bookings/[id]/receipt' as any,
              params: { id: booking.id },
            })
          }
          testID="view-receipt"
        />

        {/* FR07 — change and cancel actions */}
        {isPendingCancellation ? (
          <View style={styles.actions}>
            <Button
              label="Cancellation pending review"
              variant="ghost"
              disabled
            />
          </View>
        ) : canEdit ? (
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
              label="Request cancellation"
              variant="danger"
              onPress={() => {
                setCancellationReason('');
                setReasonError(null);
                setCancelModalVisible(true);
              }}
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

      {/* Cancellation Request Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!submittingCancellation) setCancelModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AppText variant="title">Request Cancellation</AppText>
            <AppText variant="secondary" style={styles.modalDescription}>
              Your table remains held until restaurant staff reviews and approves your request. Please tell us why you need to cancel:
            </AppText>

            <Field
              label="Reason for cancellation"
              placeholder="e.g. Schedule change, emergency..."
              value={cancellationReason}
              onChangeText={(text) => {
                setCancellationReason(text);
                if (reasonError) setReasonError(null);
              }}
              multiline
              error={reasonError || undefined}
              maxLength={300}
            />

            <View style={styles.modalActions}>
              <Button
                label={submittingCancellation ? 'Submitting...' : 'Submit cancellation request'}
                variant="danger"
                onPress={onSubmitCancellation}
                disabled={submittingCancellation}
              />
              <Button
                label="Keep my reservation"
                variant="ghost"
                onPress={() => setCancelModalVisible(false)}
                disabled={submittingCancellation}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  function onBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bookings');
    }
  }

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
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
  reasonText: { marginTop: spacing.xs, fontStyle: 'italic' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalDescription: {
    lineHeight: 20,
  },
  modalActions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
