import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InfoBox,
  LastUpdated,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchMyQueue,
  leaveQueue,
  type QueueEntry,
} from '@/services/api';
import { onQueueReady, onQueueUpdated } from '@/services/realtime/socket';
import { colors, radius, spacing } from '@/theme';

const STAGES: { key: QueueEntry['stage']; label: string }[] = [
  { key: 'joined', label: 'Joined queue' },
  { key: 'getting-closer', label: 'Getting closer' },
  { key: 'table-ready', label: 'Table ready' },
];

/**
 * Queue Tracker tab (FR04, FR05, FR06 + empty state from spec §5).
 *
 * Subscribes to Socket.IO so the position counter updates live, and shows a
 * "Last updated" stamp alongside it (NFR03).
 */
export default function QueueScreen() {
  const { confirm, showToast } = useFeedback();
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [readyEvent, setReadyEvent] = useState<Record<string, unknown> | null>(null);

  const queue = useApiQuery(['queue', 'mine'], () => fetchMyQueue());
  const entry = queue.data?.data ?? null;
  const restaurantId = entry?.restaurantId ?? entry?.restaurant?.id ?? null;

  const refetch = useCallback(() => {
    queue.refetch();
    setLiveAt(new Date().toISOString());
  }, [queue]);

  // FR05/FR06 — live updates while this screen is mounted.
  useEffect(() => {
    if (!restaurantId) return;

    const unsubscribeUpdated = onQueueUpdated(restaurantId, refetch);
    const unsubscribeReady = onQueueReady(restaurantId, (payload) => {
      setReadyEvent(payload as Record<string, unknown>);
      refetch();
    });

    return () => {
      unsubscribeUpdated();
      unsubscribeReady();
    };
  }, [restaurantId, refetch]);

  async function onLeave() {
    if (!entry) return;
    const accepted = await confirm({
      title: 'Leave the queue?',
      message: 'Your spot will be released and you would need to join again to wait.',
      confirmLabel: 'Leave queue',
      cancelLabel: 'Stay in line',
      destructive: true,
    });
    if (!accepted) return;

    try {
      await leaveQueue(entry.id);
      showToast('You have left the queue.', 'success');
      queue.refetch();
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  if (queue.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <AppText variant="title">Your queue</AppText>
        </View>
        <View style={styles.loadingCard}>
          <Skeleton height={120} radius={radius.lg} />
          <Skeleton height={18} width="60%" />
          <Skeleton height={18} width="40%" />
        </View>
      </SafeAreaView>
    );
  }

  if (queue.isError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <AppText variant="title">Your queue</AppText>
        </View>
        <ErrorState
          message={apiErrorMessage(queue.error)}
          onRetry={() => queue.refetch()}
        />
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.header}>
          <AppText variant="title">Your queue</AppText>
          <AppText variant="secondary">Nothing waiting on your side.</AppText>
        </View>
        <EmptyState
          title="No waiting today. Yet."
          message="If a restaurant is full, join its virtual queue and watch your spot move in real time — we’ll tell you when your table is ready."
          glyph="⏳"
          action={
            <Button
              label="Find a place to eat"
              onPress={() => router.push('/(tabs)/explore')}
              style={styles.emptyAction}
            />
          }
        />
      </SafeAreaView>
    );
  }

  const stageIndex = STAGES.findIndex((stage) => stage.key === entry.stage);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <AppText variant="title">Your place in line</AppText>
        <LastUpdated timestamp={liveAt ?? entry.lastUpdated} live label={liveAt ? undefined : undefined} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Position card — deep forest green per spec §8 */}
        <View style={styles.positionCard}>
          <AppText variant="caption" style={styles.positionCaption}>
            {entry.status === 'notified' ? 'You’re up!' : 'Your number in line'}
          </AppText>
          <AppText style={styles.positionNumber}>{entry.position}</AppText>
          <AppText style={styles.positionSub}>
            {entry.queueCode} · {entry.restaurant?.name}
          </AppText>

          <View style={styles.positionStats}>
            <View style={styles.stat}>
              <AppText style={styles.statValue}>{entry.partiesAhead}</AppText>
              <AppText style={styles.statLabel}>parties ahead</AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText style={styles.statValue}>{entry.estimatedWaitLabel}</AppText>
              <AppText style={styles.statLabel}>estimated wait</AppText>
            </View>
          </View>
        </View>

        {readyEvent || entry.status === 'notified' ? (
          <InfoBox tone="success">
            <AppText variant="label">Come in. Your table is ready</AppText>
            <AppText variant="secondary">
              {entry.heldTableNumber
                ? `Table ${entry.heldTableNumber} is being held for ${entry.partySize} guests.`
                : 'Head to the host stand — your party is next.'}
            </AppText>
            <Button
              label="I’m on my way"
              onPress={() => router.push('/queue/ready')}
              style={styles.readyButton}
            />
          </InfoBox>
        ) : (
          <InfoBox tone="info">
            <AppText variant="label">Your spot is saved</AppText>
            <AppText variant="secondary">
              Stay as long as you like — leaving releases your place. We’ll notify
              you the moment your table is ready.
            </AppText>
          </InfoBox>
        )}

        {/* Progress stages: Joined → Getting closer → Table ready */}
        <Card>
          <AppText variant="heading">Progress</AppText>
          <View style={styles.stages}>
            {STAGES.map((stage, index) => {
              const done = index <= stageIndex;
              const active = index === stageIndex;
              return (
                <View key={stage.key} style={styles.stageRow}>
                  <View
                    style={[
                      styles.stageDot,
                      done && styles.stageDotDone,
                      active && styles.stageDotActive,
                    ]}
                  >
                    {done ? <Ionicons name="checkmark" size={13} color={colors.textPrimary} /> : null}
                  </View>
                  <View style={styles.stageBody}>
                    <AppText variant={active ? 'label' : 'secondary'}>{stage.label}</AppText>
                    {index < STAGES.length - 1 ? <View style={styles.stageLine} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        <View style={styles.detailRow}>
          <Badge label={`Party of ${entry.partySize}`} />
          <Badge label={entry.status} tone={entry.status === 'notified' ? 'success' : 'neutral'} />
        </View>

        <Button label="Leave queue" variant="danger" onPress={onLeave} />
        <Button
          label="Browse other restaurants"
          variant="ghost"
          onPress={() => router.push('/(tabs)/explore')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  loadingCard: { padding: spacing.lg, gap: spacing.md },
  positionCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.sm,
    ...shadowCard(),
  },
  positionCaption: { color: colors.accent, letterSpacing: 1, textTransform: 'uppercase' },
  positionNumber: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 84,
    lineHeight: 90,
    color: colors.textOnPrimary,
  },
  positionSub: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Inter_500Medium' },
  positionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  stat: { alignItems: 'center', minWidth: 90 },
  statValue: {
    color: colors.textOnPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },
  stages: { gap: 0, marginTop: spacing.sm },
  stageRow: { flexDirection: 'row', gap: spacing.md },
  stageDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageDotDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  stageDotActive: { borderColor: colors.primary, borderWidth: 3 },
  stageBody: { flex: 1, paddingBottom: spacing.lg },
  stageLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
    marginLeft: -13,
    height: 22,
  },
  detailRow: { flexDirection: 'row', gap: spacing.sm },
  readyButton: { marginTop: spacing.sm },
  emptyAction: { marginTop: spacing.md, minWidth: 220 },
});

function shadowCard() {
  return {
    shadowColor: '#14211B',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  };
}
