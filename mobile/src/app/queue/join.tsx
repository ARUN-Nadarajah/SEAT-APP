import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  ErrorState,
  Field,
  InfoBox,
  LastUpdated,
  SectionTitle,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
  fetchQueuePreview,
  fetchRestaurants,
  joinQueue,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8];

/**
 * Join Virtual Queue (FR03 + FR04, spec §5).
 *
 * Shows the wait estimate and parties ahead BEFORE committing, and states
 * plainly that this is a waiting list rather than a fixed-time booking.
 */
export default function JoinQueueScreen() {
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useFeedback();

  const defaultVenueQuery = useApiQuery(
    ['default-venue-queue'],
    async () => {
      const all = await fetchRestaurants({ limit: 1 });
      return all.data?.[0] ?? null;
    },
    { enabled: !params.restaurantId },
  );

  const restaurantId = params.restaurantId || defaultVenueQuery.data?.id || '';

  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState(user?.name ?? '');
  const [guestPhone, setGuestPhone] = useState(user?.phone ?? '');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useApiQuery(
    ['queue-preview', restaurantId, partySize],
    () => fetchQueuePreview(restaurantId, partySize),
    { enabled: Boolean(restaurantId), refetchInterval: 20000 },
  );

  const data = preview.data?.data;

  async function onJoin() {
    if (!restaurantId) return;
    setJoining(true);
    setError(null);

    try {
      await joinQueue({
        restaurantId,
        partySize,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
      });
      showToast('Your spot is saved.', 'success');
      router.replace('/(tabs)/queue');
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setError(message);
      showToast(message, 'error');
    } finally {
      setJoining(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.headerTitle}>
          <AppText variant="label">Join the queue</AppText>
          <AppText variant="caption">Virtual waiting list</AppText>
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {preview.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={130} radius={radius.lg} />
            <Skeleton height={90} radius={radius.lg} />
            <Skeleton height={52} radius={radius.lg} />
          </View>
        ) : preview.isError ? (
          <ErrorState message={apiErrorMessage(preview.error)} onRetry={() => preview.refetch()} />
        ) : (
          <>
            {/* Wait summary */}
            <View style={styles.summary}>
              <AppText variant="caption" style={styles.summaryCaption}>
                {data?.restaurantName}
              </AppText>
              <View style={styles.summaryRow}>
                <View style={styles.summaryStat}>
                  <AppText style={styles.summaryValue}>
                    {data?.estimatedWaitLabel ?? '—'}
                  </AppText>
                  <AppText style={styles.summaryLabel}>estimated wait</AppText>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryStat}>
                  <AppText style={styles.summaryValue}>{data?.partiesAhead ?? 0}</AppText>
                  <AppText style={styles.summaryLabel}>parties ahead</AppText>
                </View>
              </View>
              <LastUpdated timestamp={preview.data?.lastUpdated} label="Live estimate" style={styles.summaryStamp} />
            </View>

            {/* Party size */}
            <Card>
              <SectionTitle>How many of you?</SectionTitle>
              <View style={styles.partyRow}>
                {PARTY_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => setPartySize(size)}
                    style={[styles.chip, partySize === size && styles.chipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: partySize === size }}
                    accessibilityLabel={`Party of ${size}`}
                  >
                    <AppText
                      variant="label"
                      style={partySize === size ? styles.chipTextActive : undefined}
                    >
                      {size}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </Card>

            {/* Guest details */}
            <Card>
              <SectionTitle>Who should we call?</SectionTitle>
              <Field
                label="Name"
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Your name"
                autoCapitalize="words"
              />
              <Field
                label="Phone"
                value={guestPhone}
                onChangeText={setGuestPhone}
                placeholder="+94 77 123 4567"
                keyboardType="phone-pad"
                hint="Only used for the table-ready call."
              />
            </Card>

            {/* Honesty note (spec §5) */}
            <InfoBox tone="warning">
              <AppText variant="label">Before you join</AppText>
              <AppText variant="secondary">
                This is a waiting list, not a fixed-time reservation. Wait times
                are estimates and can change; we’ll notify you the moment your
                table is ready and hold it for 10 minutes.
              </AppText>
            </InfoBox>

            {error ? (
              <InfoBox tone="danger">
                <AppText variant="label">{error}</AppText>
              </InfoBox>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Join virtual queue"
          onPress={onJoin}
          loading={joining}
          disabled={preview.isLoading}
          testID="join-queue-submit"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: { padding: spacing.lg, paddingBottom: spacing['2xl'], gap: spacing.lg },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summary: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryCaption: { color: colors.accent, letterSpacing: 1, textTransform: 'uppercase' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing['2xl'],
  },
  summaryStat: { alignItems: 'center', minWidth: 110 },
  summaryValue: {
    color: colors.textOnPrimary,
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 30,
  },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.25)' },
  summaryStamp: { justifyContent: 'center' },
  partyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 52,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextActive: { color: colors.textOnPrimary },
});
