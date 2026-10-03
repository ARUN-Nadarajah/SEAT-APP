import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Card,
  ErrorState,
  InfoBox,
  SectionTitle,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchBooking,
  fetchRestaurant,
  updateBooking,
} from '@/services/api';
import { parseSlotUnavailable } from '@/services/api/reservations.api';
import { colors, radius, spacing } from '@/theme';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10];

function nextDays(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: date.toISOString().slice(0, 10),
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(date.getDate()),
      month: date.toLocaleDateString(undefined, { month: 'short' }),
    };
  });
}

/**
 * Change Reservation (FR07).
 *
 * Two exits, exactly as specced: "Save changes" and "Keep existing booking".
 * The existing booking is never touched until Save succeeds, and a vanished
 * slot is reported inline with alternatives.
 */
export default function ChangeReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useFeedback();

  const [partySize, setPartySize] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<{ time: string; label: string }[]>([]);

  const days = useMemo(() => nextDays(), []);

  const bookingQuery = useApiQuery(['booking', id], () => fetchBooking(id!), {
    enabled: Boolean(id),
  });

  const booking = bookingQuery.data?.data?.reservation;
  const effectiveParty = partySize ?? booking?.partySize ?? 2;
  const effectiveDate = date ?? (booking ? booking.date.slice(0, 10) : days[0].value);

  const restaurantQuery = useApiQuery(
    ['restaurant', booking?.restaurant?.id],
    () =>
      fetchRestaurant(booking!.restaurant!.id, {
        partySize: effectiveParty,
        date: effectiveDate,
      }),
    { enabled: Boolean(booking?.restaurant?.id) },
  );

  const slots = restaurantQuery.data?.data?.slots ?? [];
  const effectiveTime = time ?? booking?.time ?? null;
  const hasChanges =
    partySize !== null || date !== null || (time !== null && time !== booking?.time);

  if (bookingQuery.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton height={22} width="55%" />
          <Skeleton height={100} radius={radius.lg} />
          <Skeleton height={100} radius={radius.lg} />
          <Skeleton height={52} radius={radius.lg} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (bookingQuery.isError || !booking) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ErrorState
          message={apiErrorMessage(bookingQuery.error)}
          onRetry={() => bookingQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  async function onSave() {
    // Captured locally so the async body never sees a stale/undefined value.
    const current = booking;
    if (!current) return;

    setSaving(true);
    setError(null);
    setAlternatives([]);

    try {
      await updateBooking(current.id, {
        partySize: effectiveParty,
        date: effectiveDate,
        time: effectiveTime ?? undefined,
      });
      router.replace({
        pathname: '/bookings/updated',
        params: {
          bookingId: current.bookingId,
          reservationId: current.id,
          time: effectiveTime ?? current.time,
          date: effectiveDate,
          partySize: String(effectiveParty),
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
      showToast('Changes not saved yet.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <AppText variant="title">Change reservation</AppText>
          <AppText variant="secondary">
            {booking.restaurant?.name} · {booking.bookingId}
          </AppText>
        </View>

        <InfoBox tone="info">
          <AppText variant="label">Nothing changes until you save</AppText>
          <AppText variant="secondary">
            Your existing booking stays safe until you save. Back out any time
            and nothing will have changed.
          </AppText>
        </InfoBox>

        {/* Party size */}
        <Card>
          <SectionTitle>Party size</SectionTitle>
          <View style={styles.partyRow}>
            {PARTY_SIZES.map((size) => (
              <Pressable
                key={size}
                onPress={() => setPartySize(size)}
                style={[styles.chip, effectiveParty === size && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: effectiveParty === size }}
                accessibilityLabel={`Party of ${size}`}
              >
                <AppText
                  variant="label"
                  style={effectiveParty === size ? styles.chipTextActive : undefined}
                >
                  {size}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Date */}
        <Card>
          <SectionTitle>Date</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((day) => {
              const selected = day.value === effectiveDate;
              return (
                <Pressable
                  key={day.value}
                  onPress={() => {
                    setDate(day.value);
                    setTime(null);
                  }}
                  style={[styles.day, selected && styles.dayActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <AppText variant="caption" style={selected ? styles.chipTextActive : undefined}>
                    {day.weekday}
                  </AppText>
                  <AppText variant="heading" style={selected ? styles.chipTextActive : undefined}>
                    {day.day}
                  </AppText>
                  <AppText variant="caption" style={selected ? styles.chipTextActive : undefined}>
                    {day.month}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>

        {/* Time */}
        <Card>
          <SectionTitle>Time</SectionTitle>
          {restaurantQuery.isLoading ? (
            <Skeleton height={56} radius={radius.md} />
          ) : slots.filter((slot) => slot.available).length === 0 ? (
            <InfoBox tone="warning">
              <AppText variant="label">No free slots that day</AppText>
              <AppText variant="secondary">
                Pick another date — your current booking is untouched.
              </AppText>
            </InfoBox>
          ) : (
            <View style={styles.slots}>
              {slots.map((slot) => (
                <Pressable
                  key={slot.time}
                  disabled={!slot.available}
                  onPress={() => setTime(slot.time)}
                  style={[
                    styles.slot,
                    !slot.available && styles.slotDisabled,
                    effectiveTime === slot.time && styles.slotActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: effectiveTime === slot.time, disabled: !slot.available }}
                >
                  <AppText
                    variant="label"
                    style={[
                      effectiveTime === slot.time ? styles.chipTextActive : undefined,
                      !slot.available && styles.slotTextDisabled,
                    ]}
                  >
                    {slot.timeLabel}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        {error ? (
          <InfoBox tone="danger">
            <AppText variant="label">{error}</AppText>
            {alternatives.length > 0 ? (
              <>
                <AppText variant="secondary">Available instead:</AppText>
                <View style={styles.altRow}>
                  {alternatives.map((slot) => (
                    <Pressable
                      key={slot.time}
                      onPress={() => {
                        setTime(slot.time);
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
      </ScrollView>

      {/* FR07 — two clear exits */}
      <View style={styles.footer}>
        <Button
          label="Save changes"
          onPress={onSave}
          loading={saving}
          disabled={!hasChanges}
          testID="save-changes"
        />
        <Button
          label="Keep existing booking"
          variant="secondary"
          onPress={() => router.back()}
          testID="keep-booking"
        />
      </View>
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.back}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="label">Change reservation</AppText>
      <View style={styles.back} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  intro: { gap: 2 },
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
  days: { gap: spacing.sm, paddingRight: spacing.lg },
  day: {
    width: 72,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
  },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 92,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.55 },
  slotTextDisabled: { textDecorationLine: 'line-through', color: colors.textMuted },
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
