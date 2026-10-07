import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card, EmptyState, ErrorState, InfoBox, LastUpdated, Skeleton, useFeedback } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchMyQueue, leaveQueue, type QueueEntry } from '@/services/api';
import { onQueueReady, onQueueUpdated } from '@/services/realtime/socket';
import { colors, radius, spacing } from '@/theme';

const STAGES: { key: QueueEntry['stage']; label: string }[] = [
  { key: 'joined', label: 'Joined queue' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready for pickup' },
];

export default function QueueScreen() {
  const { confirm, showToast } = useFeedback();
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const queue = useApiQuery(['queue', 'mine'], () => fetchMyQueue(), {
    refetchInterval: 5000,
  });
  const entry = queue.data?.data ?? null;
  const restaurantId = entry?.restaurantId ?? entry?.restaurant?.id ?? null;
  const refetch = useCallback(() => {
    queue.refetch();
    setLiveAt(new Date().toISOString());
  }, [queue]);

  useEffect(() => {
    if (!restaurantId) return;
    const offUpdated = onQueueUpdated(restaurantId, refetch);
    const offReady = onQueueReady(restaurantId, (payload) => {
      const userId = (payload as { userId?: string } | undefined)?.userId;
      if (userId) refetch();
    });
    return () => { offUpdated(); offReady(); };
  }, [restaurantId, refetch]);

  async function onLeave() {
    if (!entry || entry.status !== 'waiting') return;
    const accepted = await confirm({
      title: 'Leave the queue?',
      message: 'Your takeaway place will be released.',
      confirmLabel: 'Leave queue',
      cancelLabel: 'Stay in line',
      destructive: true,
    });
    if (!accepted) return;
    try {
      await leaveQueue(entry.id);
      showToast('You have left the queue.', 'success');
      queue.refetch();
    } catch (error) { showToast(apiErrorMessage(error), 'error'); }
  }

  if (queue.isLoading) return <SafeAreaView style={styles.root}><View style={styles.loading}><Skeleton height={140} radius={radius.lg} /><Skeleton height={20} width="60%" /></View></SafeAreaView>;
  if (queue.isError) return <SafeAreaView style={styles.root}><ErrorState message={apiErrorMessage(queue.error)} onRetry={() => queue.refetch()} /></SafeAreaView>;
  if (!entry) return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}><AppText variant="title">Your takeaway queue</AppText></View>
      <EmptyState title="No takeaway orders in line. Yet." message="Join a takeaway queue to track your parcel from anywhere." glyph="⏳" action={<Button label="Find a restaurant" onPress={() => router.push('/(tabs)/explore')} />} />
    </SafeAreaView>
  );

  const stageIndex = STAGES.findIndex((stage) => stage.key === entry.stage);
  const isReady = entry.status === 'ready';
  const statusMessage = entry.status === 'waiting'
    ? "You're in the queue. Stay nearby, we'll update you as soon as we start preparing your order."
    : entry.status === 'preparing'
      ? "We're preparing your order. It won't be long."
      : entry.status === 'ready'
        ? 'Your order is ready! Please collect it at the counter and show your queue code.'
        : 'Thanks! Enjoy your meal.';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}><AppText variant="title">Your takeaway order</AppText><LastUpdated timestamp={liveAt ?? entry.lastUpdated} live /></View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.positionCard}>
          <AppText variant="caption" style={styles.positionCaption}>QUEUE CODE</AppText>
          <AppText style={styles.code}>{entry.queueCode}</AppText>
          <AppText style={styles.positionSub}>{entry.restaurant?.name}</AppText>
          <View style={styles.stats}>
            <View style={styles.stat}><AppText style={styles.statValue}>{entry.ordersAhead}</AppText><AppText style={styles.statLabel}>orders ahead</AppText></View>
            <View style={styles.divider} />
            <View style={styles.stat}><AppText style={styles.statValue}>{entry.estimatedWaitLabel}</AppText><AppText style={styles.statLabel}>estimated wait</AppText></View>
          </View>
        </View>
        {isReady ? <InfoBox tone="success"><AppText variant="label">Order ready for pickup</AppText><AppText variant="secondary">{statusMessage}</AppText><Button label="I'm on my way" onPress={() => router.push('/queue/ready')} /></InfoBox> : <InfoBox tone="info"><AppText variant="secondary">{statusMessage}</AppText></InfoBox>}
        <Card><AppText variant="heading">Progress</AppText>{STAGES.map((stage, index) => <View key={stage.key} style={styles.stage}><View style={[styles.dot, index <= stageIndex && styles.dotDone]}>{index <= stageIndex ? <Ionicons name="checkmark" size={13} color={colors.textPrimary} /> : null}</View><AppText variant={index === stageIndex ? 'label' : 'secondary'}>{stage.label}</AppText></View>)}</Card>
        <View style={styles.badges}><Badge label="Parcel" tone="accent" /><Badge label={entry.status} tone={isReady ? 'success' : 'neutral'} /></View>
        <Button
          label="Leave queue"
          variant="danger"
          onPress={onLeave}
          disabled={entry.status !== 'waiting'}
          accessibilityLabel={
            entry.status === 'waiting'
              ? 'Leave queue'
              : 'Leave queue, unavailable after preparation starts'
          }
        />
        {entry.status !== 'waiting' ? (
          <Button
            label="Contact restaurant"
            variant="secondary"
            onPress={() => router.push('/restaurant' as Href)}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, gap: spacing.xs },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  loading: { padding: spacing.lg, gap: spacing.md },
  positionCard: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing['2xl'], alignItems: 'center', gap: spacing.sm },
  positionCaption: { color: colors.accent, letterSpacing: 1 },
  code: { color: colors.textOnPrimary, fontFamily: 'Fraunces_600SemiBold', fontSize: 48, letterSpacing: 4 },
  positionSub: { color: 'rgba(255,255,255,0.8)' },
  stats: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl, marginTop: spacing.md },
  stat: { alignItems: 'center', minWidth: 90 },
  statValue: { color: colors.textOnPrimary, fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  divider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  stage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  badges: { flexDirection: 'row', gap: spacing.sm },
});
