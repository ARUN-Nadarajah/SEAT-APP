import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** "Booking Updated" success screen (spec §5). */
export default function BookingUpdatedScreen() {
  const { bookingId, reservationId, time, date, partySize } = useLocalSearchParams<{
    bookingId?: string;
    reservationId?: string;
    time?: string;
    date?: string;
    partySize?: string;
  }>();

  const dateLabel = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-done" size={40} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Booking updated
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          Your changes are saved. The previous time has been released.
        </AppText>

        <Card style={styles.card}>
          <AppText variant="caption">{bookingId || 'RES-0000'}</AppText>
          <AppText variant="heading">{dateLabel}</AppText>
          <AppText variant="bodyMedium">{time}</AppText>
          <AppText variant="secondary">
            {partySize} guest{partySize === '1' ? '' : 's'}
          </AppText>
        </Card>

        <View style={styles.actions}>
          <Button
            label="View my booking"
            onPress={() =>
              router.replace(reservationId ? `/bookings/${reservationId}` : '/(tabs)/bookings')
            }
          />
          <Button label="Back to bookings" variant="secondary" onPress={() => router.replace('/(tabs)/bookings')} />
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
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 320 },
  card: { alignItems: 'center', gap: spacing.xs, width: '100%', maxWidth: 380 },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm },
});
