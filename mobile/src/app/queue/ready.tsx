import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

/**
 * Table ready screen (FR06 / spec §5).
 *
 * Full-screen "Come in. Your table is ready" with the two required actions:
 * "I'm on my way" and "View reservation".
 */
export default function TableReadyScreen() {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="restaurant" size={44} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Come in.{'\n'}Your table is ready
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          Head to the host stand and give your queue code. We’ll hold the table
          for 10 minutes.
        </AppText>

        <Card style={styles.card}>
          <AppText variant="caption">YOUR QUEUE CODE</AppText>
          <AppText variant="display" style={styles.code}>
            Q-0181
          </AppText>
          <View style={styles.hintRow}>
            <View style={styles.dot} />
            <AppText variant="secondary">
              Check the Queue tab for your live table number
            </AppText>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="I’m on my way"
            onPress={() => router.replace('/queue/arrived')}
            testID="on-my-way"
          />
          <Button
            label="View reservation"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/queue')}
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
  card: { alignItems: 'center', gap: spacing.xs, width: '100%', maxWidth: 380 },
  code: { color: colors.primary, letterSpacing: 3 },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  actions: { width: '100%', maxWidth: 380, gap: spacing.sm, marginTop: spacing.md },
});
