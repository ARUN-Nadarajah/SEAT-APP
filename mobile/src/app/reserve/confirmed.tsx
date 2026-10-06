import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, InfoBox } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Reservation Confirmed — "Your table is booked" (spec §5, Redesign Section 12).
 * Displays reference, table details, fee snapshot, and turnaround buffer notice.
 */
export default function ReservationConfirmedScreen() {
  const {
    bookingId,
    reservationId,
    tableNumber,
    reservationFee,
    date,
    timeRange,
  } = useLocalSearchParams<{
    bookingId?: string;
    reservationId?: string;
    tableNumber?: string;
    reservationFee?: string;
    date?: string;
    timeRange?: string;
  }>();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={44} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Your table is booked!
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          We’ve reserved your table and notified restaurant staff.
          Please arrive on time to enjoy your full reservation period.
        </AppText>

        <Card style={styles.bookingCard}>
          <AppText variant="caption">BOOKING REFERENCE</AppText>
          <AppText variant="display" style={styles.bookingId}>
            {bookingId || 'RES-0000'}
          </AppText>

          <View style={styles.metaDivider} />

          <View style={styles.metaList}>
            {tableNumber ? (
              <View style={styles.metaRow}>
                <AppText variant="secondary">Reserved Table:</AppText>
                <AppText variant="label">Table {tableNumber}</AppText>
              </View>
            ) : null}

            {timeRange ? (
              <View style={styles.metaRow}>
                <AppText variant="secondary">Time Range:</AppText>
                <AppText variant="label">{timeRange}</AppText>
              </View>
            ) : null}

            {date ? (
              <View style={styles.metaRow}>
                <AppText variant="secondary">Date:</AppText>
                <AppText variant="label">{date}</AppText>
              </View>
            ) : null}

            {reservationFee ? (
              <View style={styles.metaRow}>
                <AppText variant="secondary">Reservation Fee:</AppText>
                <AppText variant="label" style={{ color: colors.primary }}>
                  Rs. {reservationFee}
                </AppText>
              </View>
            ) : null}
          </View>
        </Card>

        <View style={styles.bufferNote}>
          <InfoBox tone="info">
            <AppText variant="caption">
              A 30-minute turnaround buffer follows your reservation for cleaning and resetting.
            </AppText>
          </InfoBox>
        </View>

        <View style={styles.actions}>
          <Button
            label="View Reservation Receipt"
            onPress={() =>
              router.push(
                reservationId ? (`/bookings/${reservationId}/receipt` as any) : '/(tabs)/bookings',
              )
            }
            testID="view-receipt"
          />
          <Button
            label="View my booking"
            variant="secondary"
            onPress={() =>
              router.replace(
                reservationId ? `/bookings/${reservationId}` : '/(tabs)/bookings',
              )
            }
            testID="view-booking"
          />
          <Button
            label="Back to explore"
            variant="ghost"
            onPress={() => router.replace('/(tabs)/explore')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    gap: spacing.md,
  },
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 330 },
  bookingCard: { width: '100%', maxWidth: 380, alignItems: 'center', gap: spacing.xs },
  bookingId: { letterSpacing: 2, color: colors.primary },
  metaDivider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  metaList: { width: '100%', gap: spacing.xs },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bufferNote: { width: '100%', maxWidth: 380 },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm, marginTop: spacing.sm },
});

export const confirmedRadius = radius.xl;
