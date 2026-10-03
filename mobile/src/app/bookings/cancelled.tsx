import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** "Reservation Cancelled" success screen (spec §5). */
export default function ReservationCancelledScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="close" size={44} color={colors.textOnPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Reservation cancelled
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          Your table has been released for another party. We hope to see you
          another time.
        </AppText>

        {bookingId ? (
          <Card style={styles.card}>
            <AppText variant="caption">CANCELLED BOOKING</AppText>
            <AppText variant="heading" style={styles.ref}>
              {bookingId}
            </AppText>
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Back to explore"
            onPress={() => router.replace('/(tabs)/explore')}
          />
          <Button
            label="View my bookings"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/bookings')}
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
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 320 },
  card: { alignItems: 'center', gap: spacing.xs, width: '100%', maxWidth: 380 },
  ref: { color: colors.danger, letterSpacing: 1 },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm },
});
