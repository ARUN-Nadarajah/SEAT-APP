import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Arrival confirmed — "Welcome to your table" (spec §5). */
export default function ArrivalConfirmedScreen() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={48} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Welcome to your table
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          You’ve been seated. Enjoy your meal — and your place in line has been
          used.
        </AppText>

        <Card style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <AppText variant="secondary">
              Seated at{' '}
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </AppText>
          </View>
          <View style={styles.row}>
            <Ionicons name="star-outline" size={16} color={colors.primary} />
            <AppText variant="secondary">
              Rate your visit from Profile — it takes 10 seconds.
            </AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          {/* TODO(ordering): wire "Order food" to the ordering flow in a later step. */}
          <Button
            label="Order food"
            disabled
            accessibilityLabel="Order food, coming soon"
          />
          <Button label="Back to explore" onPress={() => router.replace('/(tabs)/explore')} />
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
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', maxWidth: 330 },
  card: { width: '100%', maxWidth: 380, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm, marginTop: spacing.md },
});
