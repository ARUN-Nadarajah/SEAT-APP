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
  Field,
  InfoBox,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchRestaurant,
  fetchRestaurants,
  type TimeSlot,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10];

function nextDays(count = 7): { value: string; weekday: string; day: string; month: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const value = date.toISOString().slice(0, 10);
    return {
      value,
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
      day: String(date.getDate()),
      month: date.toLocaleDateString(undefined, { month: 'short' }),
    };
  });
}

/**
 * Reserve a Table (FR02).
 *
 * Single form: party size → date → time slots → review, so the whole flow
 * fits inside the 5-screen budget (NFR02): Reserve → Review → Confirmed.
 */
export default function ReserveScreen() {
  const params = useLocalSearchParams<{
    restaurantId?: string;
    tableId?: string;
    tableNumber?: string;
    partySize?: string;
  }>();

  const defaultVenueQuery = useApiQuery(
    ['default-venue-reserve'],
    async () => {
      const all = await fetchRestaurants({ limit: 1 });
      return all.data?.[0] ?? null;
    },
    { enabled: !params.restaurantId },
  );

  const restaurantId = params.restaurantId || defaultVenueQuery.data?.id || '';

  const initialParty = Number(params.partySize) || 2;
  const [partySize, setPartySize] = useState(initialParty);
  const [date, setDate] = useState(nextDays()[0].value);
  const [time, setTime] = useState<string | null>(null);
  const [specialRequest, setSpecialRequest] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const days = useMemo(() => nextDays(), []);

  const restaurantQuery = useApiQuery(
    ['restaurant', restaurantId, partySize, date],
    () => fetchRestaurant(restaurantId, { partySize, date }),
    { enabled: Boolean(restaurantId) },
  );

  const restaurant = restaurantQuery.data?.data;
  const slots: TimeSlot[] = restaurant?.slots ?? [];
  const freeSlots = slots.filter((slot) => slot.available);

  async function onReview() {
    if (!time || !restaurantId) {
      setFormError('Please pick a time that works for you.');
      return;
    }
    setFormError(null);

    router.push({
      pathname: '/reserve/review',
      params: {
        restaurantId,
        partySize: String(partySize),
        date,
        time,
        specialRequest,
        tableId: params.tableId || '',
        tableNumber: params.tableNumber || '',
        ...(restaurant ? { restaurantName: restaurant.name } : {}),
      },
    });
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
          <AppText variant="label">Reserve a table</AppText>
          <AppText variant="caption">
            {restaurant ? restaurant.name : 'Step 1 of 3 · details'}
          </AppText>
        </View>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {restaurantQuery.isLoading ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton height={22} width="50%" />
            <Skeleton height={90} radius={radius.lg} />
            <Skeleton height={90} radius={radius.lg} />
            <Skeleton height={48} radius={radius.pill} />
          </View>
        ) : restaurantQuery.isError ? (
          <ErrorState
            message={apiErrorMessage(restaurantQuery.error)}
            onRetry={() => restaurantQuery.refetch()}
          />
        ) : (
          <>
            {params.tableNumber ? (
              <InfoBox tone="info">
                <AppText variant="label">Selected: Table {params.tableNumber}</AppText>
                <AppText variant="secondary">
                  You are reserving Table {params.tableNumber} ({partySize} guest{partySize > 1 ? 's' : ''}). Select your date and time below.
                </AppText>
              </InfoBox>
            ) : null}

            {/* 1 — Party size */}
            <Card>
              <SectionTitle>Who’s coming?</SectionTitle>
              <View style={styles.partyRow}>
                {PARTY_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => {
                      setPartySize(size);
                      setTime(null);
                    }}
                    style={[styles.partyChip, partySize === size && styles.partyChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: partySize === size }}
                    accessibilityLabel={`Party of ${size}`}
                  >
                    <AppText
                      variant="label"
                      style={[styles.partyLabel, partySize === size && styles.partyLabelActive]}
                    >
                      {size}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </Card>

            {/* 2 — Date */}
            <Card>
              <SectionTitle>Which day?</SectionTitle>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
                {days.map((day) => {
                  const selected = day.value === date;
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
                      accessibilityLabel={`${day.weekday} ${day.day} ${day.month}`}
                    >
                      <AppText variant="caption" style={selected ? styles.dayTextActive : undefined}>
                        {day.weekday}
                      </AppText>
                      <AppText variant="heading" style={selected ? styles.dayTextActive : undefined}>
                        {day.day}
                      </AppText>
                      <AppText variant="caption" style={selected ? styles.dayTextActive : undefined}>
                        {day.month}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>

            {/* 3 — Time slots (only free ones are tappable, FR01/FR02) */}
            <Card>
              <SectionTitle>What time?</SectionTitle>
              {freeSlots.length === 0 ? (
                <InfoBox tone="warning">
                  <AppText variant="label">No tables left that day</AppText>
                  <AppText variant="secondary">
                    Try another date, or join the virtual queue instead and wait
                    from home.
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
                        time === slot.time && styles.slotActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: time === slot.time,
                        disabled: !slot.available,
                      }}
                      accessibilityLabel={`${slot.timeLabel}${slot.available ? '' : ' unavailable'}`}
                    >
                      <AppText
                        variant="label"
                        style={[
                          styles.slotText,
                          !slot.available && styles.slotTextDisabled,
                          time === slot.time && styles.slotTextActive,
                        ]}
                      >
                        {slot.timeLabel}
                      </AppText>
                      {slot.available ? (
                        <AppText variant="caption" style={time === slot.time ? styles.slotTextActive : undefined}>
                          {slot.availableTables} free
                        </AppText>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>

            {/* 4 — Optional note */}
            <Card>
              <SectionTitle>Anything we should know?</SectionTitle>
              <Field
                label="Special request (optional)"
                value={specialRequest}
                onChangeText={setSpecialRequest}
                placeholder="High chair, birthday cake, window seat…"
                multiline
                maxLength={300}
                hint="We’ll pass this to the restaurant."
              />
            </Card>

            {formError ? (
              <InfoBox tone="danger">
                <AppText variant="label">{formError}</AppText>
              </InfoBox>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={time ? `Review booking · ${formatSlotLabel(time)}` : 'Pick a time to continue'}
          onPress={onReview}
          disabled={!time || restaurantQuery.isLoading}
          testID="reserve-review"
        />
      </View>
    </SafeAreaView>
  );
}

function formatSlotLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
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
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  partyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  partyChip: {
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
  partyChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  partyLabel: { fontSize: 16 },
  partyLabelActive: { color: colors.textOnPrimary },
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
  dayTextActive: { color: colors.textOnPrimary },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minWidth: 96,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  slotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.55 },
  slotText: { fontSize: 15 },
  slotTextDisabled: { textDecorationLine: 'line-through', color: colors.textMuted },
  slotTextActive: { color: colors.textOnPrimary },
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
