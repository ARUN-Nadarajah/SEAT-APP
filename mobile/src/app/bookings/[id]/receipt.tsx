import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  InfoBox,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchReceiptById,
  fetchReservationReceipt,
  type Receipt,
  type ReceiptResponse,
  type ReceiptVersionSummary,
} from '@/services/api';
import { colors, radius, shadow, spacing } from '@/theme';

/**
 * Reservation Receipt Screen — E-Receipt / Reservation Confirmation System.
 * Displays authoritative snapshot of customer, restaurant, table, time, pricing,
 * unpaid payment status, and cancellation policy, with version history switcher.
 */
export default function ReservationReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);

  const query = useApiQuery(
    ['reservation-receipt', id, selectedReceiptId],
    () =>
      selectedReceiptId
        ? fetchReceiptById(selectedReceiptId)
        : fetchReservationReceipt(id!),
    {
      enabled: Boolean(id),
    },
  );

  const data = query.data?.data;
  const receipt = data?.receipt;
  const versions: ReceiptVersionSummary[] = data?.versions ?? [];

  async function onShareReceipt(rcpt: Receipt) {
    try {
      const message = [
        `🍽️ SEAT RESERVATION RECEIPT: ${rcpt.receiptNumber}`,
        `Restaurant: ${rcpt.restaurant.name}`,
        `Booking Ref: ${rcpt.bookingReference}`,
        `Date: ${rcpt.reservation.dateFormatted || rcpt.reservation.date}`,
        `Time: ${rcpt.reservation.startTime} – ${rcpt.reservation.endTime} (${rcpt.reservation.durationMinutes} min)`,
        `Table: ${rcpt.table.tableNumber ? `Table ${rcpt.table.tableNumber}` : 'Assigned on arrival'}`,
        `Guests: ${rcpt.reservation.partySize}`,
        `Fee: Rs. ${rcpt.pricing.reservationFee} (${rcpt.payment.statusLabel})`,
        `Status: ${rcpt.reservationStatus.toUpperCase()}`,
      ].join('\n');

      await Share.share({
        title: `Reservation Receipt - ${rcpt.bookingReference}`,
        message,
      });
    } catch {
      // User dismissed share sheet
    }
  }

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (id) {
      router.replace(`/bookings/${id}` as any);
    } else {
      router.replace('/(tabs)/bookings');
    }
  }

  function handleGoToBookingDetails() {
    if (id) {
      router.replace(`/bookings/${id}` as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bookings');
    }
  }

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ReceiptHeader onBack={handleBack} />
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton height={32} width="50%" />
          <Skeleton height={420} radius={radius.lg} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (query.isError || !receipt) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ReceiptHeader onBack={handleBack} />
        <ErrorState
          message={apiErrorMessage(query.error) || 'Reservation receipt unavailable.'}
          onRetry={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  const isSuperseded = receipt.status === 'superseded';

  const statusTone =
    receipt.reservationStatus === 'confirmed'
      ? 'accent'
      : receipt.reservationStatus === 'checked-in' || receipt.reservationStatus === 'completed'
        ? 'success'
        : receipt.reservationStatus === 'cancellation_pending'
          ? 'warning'
          : 'danger';

  const issuedDateLabel = new Date(receipt.issuedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ReceiptHeader onBack={handleBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Version Switcher (when modifications exist) */}
        {versions.length > 1 ? (
          <View style={styles.versionBar}>
            <AppText variant="caption" style={styles.versionBarTitle}>
              RECEIPT VERSIONS:
            </AppText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.versionChips}
            >
              {versions.map((v) => {
                const isActive =
                  (selectedReceiptId && selectedReceiptId === v.id) ||
                  (!selectedReceiptId && v.id === receipt.id);
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => setSelectedReceiptId(v.id)}
                    style={[
                      styles.versionChip,
                      isActive && styles.versionChipActive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      style={[
                        styles.versionChipText,
                        isActive && styles.versionChipTextActive,
                      ]}
                    >
                      v{v.version} {v.status === 'current' ? '(Current)' : '(Superseded)'}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Superseded Warning Banner */}
        {isSuperseded ? (
          <InfoBox tone="warning">
            <AppText variant="label">Superseded Receipt Snapshot</AppText>
            <AppText variant="caption">
              This receipt reflects an earlier version superseded on{' '}
              {receipt.supersededAt
                ? new Date(receipt.supersededAt).toLocaleDateString()
                : 'a previous update'}
              . Tap "Current" version above to view the active booking receipt.
            </AppText>
          </InfoBox>
        ) : null}

        {/* Main Digital Receipt Card */}
        <View style={styles.receiptContainer}>
          <Card style={styles.receiptCard} padded={false}>
            {/* Receipt Header Banner */}
            <View style={styles.receiptTop}>
              <View style={styles.brandRow}>
                <Ionicons name="restaurant" size={20} color={colors.primary} />
                <AppText variant="label" style={styles.brandLabel}>
                  SEAT RESERVATION RECEIPT
                </AppText>
              </View>

              <AppText variant="display" style={styles.restaurantName}>
                {receipt.restaurant.name}
              </AppText>

              {receipt.restaurant.cuisine ? (
                <AppText variant="secondary" style={styles.restaurantMeta}>
                  {receipt.restaurant.cuisine} Cuisine
                </AppText>
              ) : null}

              {receipt.restaurant.address ? (
                <AppText variant="caption" style={styles.restaurantAddress}>
                  {receipt.restaurant.address}
                  {receipt.restaurant.city ? `, ${receipt.restaurant.city}` : ''}
                </AppText>
              ) : null}

              {receipt.restaurant.phone ? (
                <AppText variant="caption" style={styles.restaurantPhone}>
                  Tel: {receipt.restaurant.phone}
                </AppText>
              ) : null}
            </View>

            {/* Perforated Divider */}
            <PerforatedDivider />

            {/* Reference & Status Snapshot */}
            <View style={styles.receiptSection}>
              <View style={styles.metaRow}>
                <View>
                  <AppText variant="caption">BOOKING REFERENCE</AppText>
                  <AppText variant="heading" style={styles.refText}>
                    {receipt.bookingReference}
                  </AppText>
                </View>
                <View style={styles.alignRight}>
                  <AppText variant="caption">RECEIPT NUMBER</AppText>
                  <AppText variant="label" style={styles.receiptNumText}>
                    {receipt.receiptNumber}
                  </AppText>
                </View>
              </View>

              <View style={styles.metaRow}>
                <View>
                  <AppText variant="caption">ISSUED AT</AppText>
                  <AppText variant="caption" style={styles.metaValue}>
                    {issuedDateLabel}
                  </AppText>
                </View>
                <View style={styles.alignRight}>
                  <AppText variant="caption">STATUS</AppText>
                  <Badge label={receipt.reservationStatus.toUpperCase()} tone={statusTone} />
                </View>
              </View>
            </View>

            {/* Perforated Divider */}
            <PerforatedDivider />

            {/* Customer Details */}
            <View style={styles.receiptSection}>
              <AppText variant="caption" style={styles.sectionHeader}>
                GUEST DETAILS
              </AppText>
              <View style={styles.detailRow}>
                <AppText variant="secondary">Guest Name:</AppText>
                <AppText variant="label">{receipt.customer.name || 'Guest'}</AppText>
              </View>
              {receipt.customer.phone ? (
                <View style={styles.detailRow}>
                  <AppText variant="secondary">Phone:</AppText>
                  <AppText variant="label">{receipt.customer.phone}</AppText>
                </View>
              ) : null}
              {receipt.customer.email ? (
                <View style={styles.detailRow}>
                  <AppText variant="secondary">Email:</AppText>
                  <AppText variant="caption">{receipt.customer.email}</AppText>
                </View>
              ) : null}
            </View>

            {/* Perforated Divider */}
            <PerforatedDivider />

            {/* Reservation Timing & Table */}
            <View style={styles.receiptSection}>
              <AppText variant="caption" style={styles.sectionHeader}>
                RESERVATION DETAILS
              </AppText>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Date:</AppText>
                <AppText variant="label">
                  {receipt.reservation.dateFormatted ||
                    new Date(receipt.reservation.date).toLocaleDateString()}
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Time Range:</AppText>
                <AppText variant="label">
                  {receipt.reservation.startTime} – {receipt.reservation.endTime}
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Duration:</AppText>
                <AppText variant="label">
                  {receipt.reservation.durationMinutes} min ({receipt.reservation.durationHours} hr{receipt.reservation.durationHours > 1 ? 's' : ''})
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Party Size:</AppText>
                <AppText variant="label">
                  {receipt.reservation.partySize} {receipt.reservation.partySize === 1 ? 'Guest' : 'Guests'}
                </AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Reserved Table:</AppText>
                <AppText variant="label">
                  {receipt.table.tableNumber
                    ? `Table ${receipt.table.tableNumber}`
                    : 'Table assigned on arrival'}
                  {receipt.table.capacity ? ` · Max ${receipt.table.capacity}` : ''}
                </AppText>
              </View>

              {receipt.reservation.specialRequest ? (
                <View style={styles.specialReqRow}>
                  <AppText variant="secondary">Special Request:</AppText>
                  <AppText variant="caption" style={styles.specialReqText}>
                    "{receipt.reservation.specialRequest}"
                  </AppText>
                </View>
              ) : null}
            </View>

            {/* Perforated Divider */}
            <PerforatedDivider />

            {/* Pricing Snapshot & Payment Status */}
            <View style={styles.receiptSection}>
              <AppText variant="caption" style={styles.sectionHeader}>
                RESERVATION FEE BREAKDOWN
              </AppText>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Table Hourly Rate:</AppText>
                <AppText variant="label">Rs. {receipt.pricing.hourlyRate} / hr</AppText>
              </View>

              <View style={styles.detailRow}>
                <AppText variant="secondary">Reserved Duration:</AppText>
                <AppText variant="label">{receipt.pricing.durationHours} hrs</AppText>
              </View>

              <View style={styles.feeDivider} />

              <View style={styles.totalRow}>
                <AppText variant="heading">Total Reservation Fee:</AppText>
                <AppText variant="heading" style={styles.totalAmount}>
                  Rs. {receipt.pricing.reservationFee}
                </AppText>
              </View>

              {/* Explicit Unpaid Payment Status */}
              <View style={styles.paymentBox}>
                <View style={styles.paymentStatusRow}>
                  <AppText variant="secondary">Payment Status:</AppText>
                  <View style={styles.unpaidChip}>
                    <Ionicons name="time-outline" size={14} color={colors.warning} />
                    <AppText variant="label" style={styles.unpaidChipText}>
                      {receipt.payment.statusLabel || 'Unpaid'}
                    </AppText>
                  </View>
                </View>
                <AppText variant="caption" style={styles.paymentNote}>
                  {receipt.payment.paymentMethod || 'In-Person Settlement'} · Payment is collected at the restaurant upon arrival.
                </AppText>
              </View>
            </View>

            {/* Perforated Divider */}
            <PerforatedDivider />

            {/* Cancellation Policy Snapshot */}
            <View style={styles.receiptSection}>
              <AppText variant="caption" style={styles.sectionHeader}>
                CANCELLATION POLICY
              </AppText>
              <AppText variant="caption" style={styles.policyText}>
                {receipt.cancellationPolicy.policyText}
              </AppText>

              {receipt.cancellationDetails?.reason ? (
                <View style={styles.cancellationLog}>
                  <AppText variant="caption" style={styles.cancellationLogLabel}>
                    Cancellation Reason:
                  </AppText>
                  <AppText variant="caption" style={styles.cancellationLogText}>
                    "{receipt.cancellationDetails.reason}"
                  </AppText>
                  {receipt.cancellationDetails.reviewComment ? (
                    <AppText variant="caption" style={styles.cancellationLogReview}>
                      Staff Note: "{receipt.cancellationDetails.reviewComment}"
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Digital Stamp / Barcode Decor */}
            <View style={styles.receiptFooter}>
              <AppText variant="caption" style={styles.barcodeText}>
                |||| | ||||| || |||||| ||| |||| | ||||||| ||| ||||
              </AppText>
              <AppText variant="caption" style={styles.footerNote}>
                Thank you for reserving with SEAT. Please arrive 5 minutes before your time.
              </AppText>
            </View>
          </Card>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Button
            label="Share Receipt"
            variant="secondary"
            onPress={() => onShareReceipt(receipt)}
            testID="share-receipt"
          />
          <Button
            label="Back to Booking Details"
            onPress={handleGoToBookingDetails}
            testID="back-to-booking"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReceiptHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </Pressable>
      <View style={styles.headerTitleBlock}>
        <AppText variant="title">Reservation Receipt</AppText>
        <AppText variant="caption" style={styles.headerSubtitle}>
          Confirmation & Snapshot
        </AppText>
      </View>
      <View style={{ width: 40 }} />
    </View>
  );
}

function PerforatedDivider() {
  return (
    <View style={styles.perforatedWrapper}>
      <View style={styles.notchLeft} />
      <View style={styles.dashedLine} />
      <View style={styles.notchRight} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBlock: { alignItems: 'center' },
  headerSubtitle: { color: colors.textSecondary },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  versionBar: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.xs,
  },
  versionBarTitle: { color: colors.textSecondary },
  versionChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  versionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  versionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  versionChipText: { color: colors.textSecondary },
  versionChipTextActive: { color: colors.textOnPrimary, fontFamily: 'Inter_600SemiBold' },

  receiptContainer: {
    width: '100%',
    maxWidth: 420,
  },
  receiptCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  receiptTop: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  brandLabel: {
    letterSpacing: 1.5,
    fontSize: 11,
    color: colors.primary,
    fontFamily: 'Inter_600SemiBold',
  },
  restaurantName: {
    textAlign: 'center',
    color: colors.textPrimary,
  },
  restaurantMeta: {
    textAlign: 'center',
    color: colors.textSecondary,
  },
  restaurantAddress: {
    textAlign: 'center',
    color: colors.textMuted,
  },
  restaurantPhone: {
    textAlign: 'center',
    color: colors.textMuted,
  },

  perforatedWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    height: 24,
    marginVertical: -4,
  },
  notchLeft: {
    width: 14,
    height: 24,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: colors.background,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    marginLeft: -1,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginHorizontal: spacing.xs,
  },
  notchRight: {
    width: 14,
    height: 24,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: colors.background,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    marginRight: -1,
  },

  receiptSection: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  sectionHeader: {
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alignRight: { alignItems: 'flex-end' },
  refText: {
    color: colors.primary,
    letterSpacing: 1,
  },
  receiptNumText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
  },
  metaValue: {
    color: colors.textSecondary,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specialReqRow: {
    marginTop: spacing.xs,
    gap: 2,
  },
  specialReqText: {
    color: colors.textPrimary,
    fontStyle: 'italic',
  },

  feeDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalAmount: {
    color: colors.primary,
    fontFamily: 'PlayfairDisplay_700Bold',
  },

  paymentBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  paymentStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unpaidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBox,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  unpaidChipText: {
    color: colors.warning,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  paymentNote: {
    color: colors.textSecondary,
    fontSize: 11,
  },

  policyText: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  cancellationLog: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    gap: 2,
  },
  cancellationLogLabel: { color: colors.textMuted },
  cancellationLogText: { color: colors.danger, fontStyle: 'italic' },
  cancellationLogReview: { color: colors.textSecondary, marginTop: 2 },

  receiptFooter: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barcodeText: {
    letterSpacing: 2,
    color: colors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  footerNote: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 10,
    maxWidth: 280,
  },

  actions: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing['2xl'],
  },
});
