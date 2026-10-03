import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

/**
 * Reservation Confirmed — "Your table is booked" (spec §5).
 * Offers the two expected exits: View my booking, Back to explore.
 */
export default function ReservationConfirmedScreen() {
  const { bookingId, reservationId } = useLocalSearchParams<{
    bookingId?: string;
    reservationId?: string;
  }>();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={44} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Your table is booked
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          We’ve held your table and sent a confirmation to your notifications.
          Arrive within 15 minutes of your slot to keep it.
        </AppText>

        <Card style={styles.bookingCard}>
          <AppText variant="caption">BOOKING REFERENCE</AppText>
          <AppText variant="display" style={styles.bookingId}>
            {bookingId || 'RES-0000'}
          </AppText>
          <View style={styles.dotRow}>
            <View style={styles.dot} />
            <AppText variant="secondary">Manage it any time from Bookings</AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="View my booking"
            onPress={() =>
              router.replace(
                reservationId ? `/bookings/${reservationId}` : '/(tabs)/bookings',
              )
            }
            testID="view-booking"
          />
          <Button
            label="Back to explore"
            variant="secondary"
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
    gap: spacing.lg,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 330 },
  bookingCard: { alignItems: 'center', gap: spacing.xs, width: '100%', maxWidth: 380 },
  bookingId: { letterSpacing: 2, color: colors.primary },
  dotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm, marginTop: spacing.md },
});

export const confirmedRadius = radius.xl;
