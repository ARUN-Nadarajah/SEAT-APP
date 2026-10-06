import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchMyQueue } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

/**
 * Takeaway order ready screen.
 *
 * Full-screen "Come in. Your table is ready" with the required action
 * "I'm on my way". The queue code / table come from the live entry rather
 * than a placeholder, so the screen stays correct after a refresh.
 */
export default function TableReadyScreen() {
  const queue = useApiQuery(['queue', 'mine'], () => fetchMyQueue());
  const entry = queue.data?.data ?? null;

  if (queue.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Skeleton height={96} width={96} radius={48} />
          <Skeleton height={34} width="70%" />
          <Skeleton height={20} width="80%" />
          <Skeleton height={120} radius={radius.lg} style={{ alignSelf: 'stretch' }} />
        </View>
      </SafeAreaView>
    );
  }

  if (queue.isError) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <ErrorState
            message={apiErrorMessage(queue.error)}
            onRetry={() => queue.refetch()}
          />
          <Button
            label="Back to queue"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/queue')}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <EmptyState
            title="No active queue spot"
            message="Your place in line has been used, or you have left the queue. Join again whenever you like."
            glyph="⏳"
            action={
              <Button
                label="Browse tables"
                onPress={() => router.replace('/(tabs)/explore')}
              />
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={56} color={colors.textPrimary} />
        </View>

        <AppText variant="display" style={styles.title}>
          Order ready for pickup
        </AppText>
        <AppText variant="secondary" style={styles.subtitle}>
          Your parcel is ready. Collect it at the counter and show your queue code.
        </AppText>

        <Card style={styles.card}>
          <AppText variant="caption">YOUR QUEUE CODE</AppText>
          <AppText variant="display" style={styles.code}>
            {entry.queueCode}
          </AppText>
          <AppText variant="secondary">
            {entry.restaurant?.name ?? 'Your restaurant'}
          </AppText>
          <View style={styles.hintRow}>
            <View style={styles.dot} />
            <AppText variant="secondary">
              Your queue code is your pickup reference
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
            label="Back to queue"
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
