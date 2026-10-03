import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  InfoBox,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, createBooking, fetchRestaurant } from '@/services/api';
import { parseSlotUnavailable } from '@/services/api/reservations.api';
import { colors, radius, spacing } from '@/theme';

/**
 * Review Reservation — "One last look" (spec §5, FR02 step 3 of 3).
 *
 * Carries a courtesy note about cancelling (spec §9: error prevention) and
 * tells the user their existing booking stays safe until they save.
 */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{
    restaurantId: string;
    restaurantName?: string;
    partySize: string;
    date: string;
    time: string;
    specialRequest?: string;
  }>();
  const { showToast } = useFeedback();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<{ time: string; label: string }[]>([]);

  const partySize = Number(params.partySize) || 2;

  const restaurantQuery = useApiQuery(
    ['restaurant', params.restaurantId],
    () => fetchRestaurant(params.restaurantId!, { partySize, date: params.date }),
    { enabled: Boolean(params.restaurantId) },
  );

  const restaurant = restaurantQuery.data?.data;

  async function onConfirm() {
    setSubmitting(true);
    setError(null);
    setAlternatives([]);

    try {
      const result = await createBooking({
        restaurantId: params.restaurantId,
        date: params.date,
        time: params.time,
        partySize,
        specialRequest: params.specialRequest || undefined,
      });

      router.replace({
        pathname: '/reserve/confirmed',
        params: {
          bookingId: result.data?.reservation.bookingId ?? '',
          reservationId: result.data?.reservation.id ?? '',
        },
      });
    } catch (caught) {
      const slotError = parseSlotUnavailable(caught);
      if (slotError) {
        setError(slotError.message);
        setAlternatives(slotError.alternatives);
      } else {
        setError(apiErrorMessage(caught));
      }
      showToast('Booking not confirmed yet.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const dateLabel = new Date(`${params.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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
          <AppText variant="label">One last look</AppText>
          <AppText variant="caption">Step 3 of 3 · confirm</AppText>
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <AppText variant="title">{restaurant?.name ?? params.restaurantName}</AppText>
          <AppText variant="secondary">{restaurant?.address}</AppText>

          <View style={styles.summary}>
            <Row icon="calendar-outline" label="Date" value={dateLabel} />
            <Row icon="time-outline" label="Time" value={formatTime(params.time)} />
            <Row
              icon="people-outline"
              label="Party size"
              value={`${partySize} guest${partySize === 1 ? '' : 's'}`}
            />
            <Row
              icon="grid-outline"
              label="Table"
              value="Assigned when you arrive"
            />
            {params.specialRequest ? (
              <Row icon="chatbubble-ellipses-outline" label="Note" value={params.specialRequest} />
            ) : null}
          </View>
        </Card>

        <InfoBox tone="warning">
          <AppText variant="label">A small courtesy</AppText>
          <AppText variant="secondary">
            Plans change — if you can’t make it, please cancel so another party
            can take the table. You can change or cancel any time from
            Bookings; nothing is final until you confirm here.
          </AppText>
        </InfoBox>

        {error ? (
          <InfoBox tone="danger">
            <AppText variant="label">{error}</AppText>
            {alternatives.length > 0 ? (
              <>
                <AppText variant="secondary">
                  Your existing booking stays safe until you save — pick one of
                  these instead:
                </AppText>
                <View style={styles.altRow}>
                  {alternatives.map((slot) => (
                    <Pressable
                      key={slot.time}
                      onPress={() => {
                        router.setParams({ time: slot.time });
                        setError(null);
                        setAlternatives([]);
                      }}
                      style={styles.altChip}
                    >
                      <AppText variant="label" style={styles.altText}>
                        {slot.label}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </InfoBox>
        ) : null}

        <Button
          label="Confirm reservation"
          onPress={onConfirm}
          loading={submitting}
          testID="confirm-reservation"
        />
        <Button label="Change details" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={17} color={colors.primary} />
      <AppText variant="secondary" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

export function formatTime(time?: string): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
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
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  summary: { gap: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { width: 92 },
  rowValue: { flex: 1, textAlign: 'right' },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  altChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  altText: { color: colors.primary },
});
