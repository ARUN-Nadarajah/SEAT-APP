import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import {
  ReservationTimeRangePicker,
  minutesToTime,
  timeToMinutes,
} from '@/components/ReservationTimeRangePicker';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchBooking,
  fetchSlotAvailability,
  fetchTables,
  updateBooking,
  type Booking,
  type Table,
} from '@/services/api';
import { parseSlotUnavailable } from '@/services/api/reservations.api';
import { colors, radius, spacing } from '@/theme';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

function nextDays(count = 30) {
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

function formatSlotLabel(time: string): string {
  const [hours, minutes] = (time || '').split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
}

export default function ChangeReservationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useFeedback();

  const days = useMemo(() => nextDays(30), []);

  const bookingQuery = useApiQuery(['booking', id], () => fetchBooking(id!), {
    enabled: Boolean(id),
  });

  const rawBookingData = bookingQuery.data?.data as Record<string, any> | undefined;
  const booking = (rawBookingData?.reservation ?? rawBookingData) as Booking | undefined;

  const bookingStart = booking?.startTime ?? booking?.time ?? '12:00';
  const bookingEnd = booking?.endTime ?? '13:30';
  const bookingDuration = booking?.durationMinutes
    ? Number(booking.durationMinutes)
    : Math.max(30, timeToMinutes(bookingEnd) - timeToMinutes(bookingStart));

  const [partySize, setPartySize] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<{ time: string; label: string }[]>([]);

  const effectiveParty = partySize ?? booking?.partySize ?? 2;
  const effectiveDate = date ?? (booking ? booking.date.slice(0, 10) : days[0].value);
  const effectiveStartTime = startTime ?? bookingStart;
  const effectiveDuration = durationMinutes ?? bookingDuration;
  const effectiveEndTime = minutesToTime(
    Math.min(1320, timeToMinutes(effectiveStartTime) + effectiveDuration),
  );

  const restaurantId = booking?.restaurant?.id || '';

  const [isChangingTable, setIsChangingTable] = useState(false);

  // Venue tables query (table selection priority)
  const tablesQuery = useApiQuery(
    ['restaurant-tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId) },
  );

  const allTables: Table[] = tablesQuery.data?.data ?? [];

  const eligibleTables = useMemo(() => {
    return allTables
      .filter((t) => t.isActive !== false && t.status !== 'maintenance' && t.capacity >= effectiveParty)
      .sort((a, b) => {
        if (a.capacity !== b.capacity) return a.capacity - b.capacity;
        return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true });
      });
  }, [allTables, effectiveParty]);

  const currentTableId = selectedTableId ?? (booking?.tableId || null);
  const selectedTable = useMemo(() => {
    return allTables.find((t) => t.id === currentTableId || t._id === currentTableId) || null;
  }, [allTables, currentTableId]);

  // If party size exceeds current table capacity, expand table selection
  useEffect(() => {
    if (selectedTable && selectedTable.capacity < effectiveParty) {
      setIsChangingTable(true);
    }
  }, [selectedTable, effectiveParty]);

  // Slot availability query (Greys out unavailable slots FOR THE SELECTED TABLE)
  const slotAvailabilityQuery = useApiQuery(
    ['change-slot-availability', restaurantId, effectiveDate, effectiveParty, currentTableId, effectiveStartTime],
    async () => {
      if (!restaurantId || !effectiveDate) return null;
      const res = await fetchSlotAvailability({
        restaurantId,
        date: effectiveDate,
        partySize: effectiveParty,
        tableId: currentTableId || undefined,
        startTime: effectiveStartTime || undefined,
      });
      return res.data ?? null;
    },
    {
      enabled: Boolean(restaurantId && effectiveDate && effectiveParty > 0),
    },
  );

  const slotData = slotAvailabilityQuery.data;

  // Adjust startTime if current selection is unavailable
  useEffect(() => {
    if (slotData?.startSlots && slotData.startSlots.length > 0) {
      const current = slotData.startSlots.find((s) => s.time === effectiveStartTime);
      if (current && !current.available) {
        const firstFree = slotData.startSlots.find((s) => s.available);
        if (firstFree) {
          setStartTime(firstFree.time);
        }
      }
    }
  }, [slotData, effectiveStartTime]);

  // Adjust duration when startTime or slotData changes
  useEffect(() => {
    if (slotData?.endSlots && slotData.endSlots.length > 0 && effectiveDuration > 0) {
      const currentEnd = slotData.endSlots.find((e) => e.durationMinutes === effectiveDuration);
      if (currentEnd && !currentEnd.available) {
        const firstFreeEnd = slotData.endSlots.find((e) => e.available);
        if (firstFreeEnd && typeof firstFreeEnd.durationMinutes === 'number') {
          setDurationMinutes(firstFreeEnd.durationMinutes);
        } else {
          setDurationMinutes(0);
        }
      }
    }
  }, [slotData, effectiveDuration]);

  const hasChanges =
    partySize !== null ||
    date !== null ||
    (startTime !== null && startTime !== bookingStart) ||
    (durationMinutes !== null && durationMinutes !== bookingDuration) ||
    (selectedTableId !== null && selectedTableId !== booking?.tableId);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (id) {
      router.replace(`/bookings/${id}` as any);
    } else {
      router.replace('/(tabs)/bookings');
    }
  }

  if (bookingQuery.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={handleBack} />
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
        <Header onBack={handleBack} />
        <ErrorState
          message={apiErrorMessage(bookingQuery.error)}
          onRetry={() => bookingQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  async function onSave() {
    const current = booking;
    if (!current) return;

    setSaving(true);
    setError(null);
    setAlternatives([]);

    try {
      await updateBooking(current.id, {
        partySize: effectiveParty,
        date: effectiveDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        time: effectiveStartTime,
        tableId: selectedTable?.id || selectedTable?._id || undefined,
      });

      router.replace({
        pathname: '/bookings/updated',
        params: {
          bookingId: current.bookingId,
          reservationId: current.id,
          time: `${formatSlotLabel(effectiveStartTime)} – ${formatSlotLabel(effectiveEndTime)}`,
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
      <Header onBack={handleBack} />

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

        {/* 1 — Party size */}
        <Card>
          <SectionTitle>Party size</SectionTitle>
          <View style={styles.partyRow}>
            {PARTY_SIZES.map((size) => (
              <Pressable
                key={size}
                onPress={() => {
                  setPartySize(size);
                  setSelectedTableId(null);
                }}
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
          {slotData && slotData.hasTablesForPartySize === false ? (
            <View style={{ marginTop: spacing.md }}>
              <InfoBox tone="warning">
                <AppText variant="label">Party size exceeds table capacity</AppText>
                <AppText variant="secondary">
                  This venue accommodates up to {slotData.maxCapacity || 8} guests per table. For larger parties, please contact the restaurant directly.
                </AppText>
              </InfoBox>
            </View>
          ) : null}
        </Card>

        {/* 2 — Date */}
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
                    setSelectedTableId(null);
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

        {/* 3 — Table Selection (Priority) */}
        {selectedTable && selectedTable.capacity >= effectiveParty && !isChangingTable ? (
          <Card>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>Your selected table</SectionTitle>
              <Pressable
                onPress={() => setIsChangingTable(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change table"
              >
                <AppText variant="label" style={styles.changeTableButtonText}>
                  Change table
                </AppText>
              </Pressable>
            </View>

            <View style={styles.selectedTableCard}>
              <View style={styles.tableCardLeft}>
                <View style={[styles.radioCircle, styles.radioCircleSelected]}>
                  <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                </View>
                <View style={{ gap: 2 }}>
                  <AppText variant="label" style={styles.tableTitleActive}>
                    Table {selectedTable.tableNumber}
                  </AppText>
                  <AppText variant="caption" style={styles.tableMeta}>
                    Up to {selectedTable.capacity} seats · {selectedTable.location || 'Indoor'}
                  </AppText>
                </View>
              </View>
              <View style={styles.tableCardRight}>
                <AppText variant="caption" style={styles.tableRate}>
                  Rs. {selectedTable.hourlyReservationRate ?? 300}/hr
                </AppText>
              </View>
            </View>
          </Card>
        ) : (
          <Card>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>Select table</SectionTitle>
              {selectedTable && selectedTable.capacity >= effectiveParty ? (
                <Pressable onPress={() => setIsChangingTable(false)} hitSlop={8}>
                  <AppText variant="label" style={styles.changeTableButtonText}>
                    Keep Table {selectedTable.tableNumber}
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {selectedTable && selectedTable.capacity < effectiveParty ? (
              <View style={{ marginBottom: spacing.sm }}>
                <InfoBox tone="warning">
                  <AppText variant="caption">
                    Table {selectedTable.tableNumber} accommodates up to {selectedTable.capacity} guests. Please select a table for {effectiveParty} guests below:
                  </AppText>
                </InfoBox>
              </View>
            ) : null}

            {tablesQuery.isLoading ? (
              <Skeleton height={56} radius={radius.md} />
            ) : eligibleTables.length === 0 ? (
              <InfoBox tone="warning">
                <AppText variant="label">No free tables for this party size</AppText>
                <AppText variant="secondary">
                  No tables can seat {effectiveParty} guests at this venue.
                </AppText>
              </InfoBox>
            ) : (
              <View style={styles.tableList}>
                {eligibleTables.map((t) => {
                  const isSelected = (selectedTable?.id || selectedTable?._id) === (t.id || t._id);
                  return (
                    <Pressable
                      key={t.id || t._id}
                      onPress={() => {
                        setSelectedTableId(t.id || t._id || null);
                        setIsChangingTable(false);
                      }}
                      style={[styles.tableCard, isSelected && styles.tableCardSelected]}
                    >
                      <View style={styles.tableCardLeft}>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                          {isSelected ? (
                            <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
                          ) : null}
                        </View>
                        <View>
                          <AppText variant="label" style={isSelected ? styles.tableTitleActive : undefined}>
                            Table {t.tableNumber}
                          </AppText>
                          <AppText variant="caption" style={styles.tableMeta}>
                            Up to {t.capacity} seats · {t.location || 'Indoor'}
                          </AppText>
                        </View>
                      </View>
                      <View style={styles.tableCardRight}>
                        <AppText variant="caption" style={styles.tableRate}>
                          Rs. {t.hourlyReservationRate ?? 300}/hr
                        </AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>
        )}

        {/* 4 — Time range */}
        <ReservationTimeRangePicker
          title="Time range"
          startTime={effectiveStartTime}
          durationMinutes={effectiveDuration}
          onStartTimeChange={(newStart) => {
            setStartTime(newStart);
            setError(null);
          }}
          onDurationChange={(newDur) => {
            setDurationMinutes(newDur);
            setError(null);
          }}
          slotData={slotData}
          isLoading={slotAvailabilityQuery.isFetching}
          selectedTable={selectedTable}
          hourlyRate={selectedTable?.hourlyReservationRate ?? 300}
        />

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
                        setStartTime(slot.time);
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
          disabled={
            !hasChanges ||
            !selectedTable ||
            isChangingTable ||
            selectedTable.capacity < effectiveParty ||
            effectiveDuration < 30 ||
            !effectiveStartTime
          }
          testID="save-changes"
        />
        <Button
          label="Keep existing booking"
          variant="secondary"
          onPress={handleBack}
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
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  intro: { gap: spacing.xs },
  subHint: { color: colors.textSecondary, marginBottom: spacing.sm },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  partyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minWidth: 48,
    minHeight: 44,
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
  tableList: { gap: spacing.sm, marginTop: spacing.sm },
  tableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tableCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft || colors.surface,
  },
  tableCardLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  radioCircleSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  tableTitleActive: { color: colors.primary },
  tableMeta: { color: colors.textSecondary },
  tableCardRight: { alignItems: 'flex-end', gap: 2 },
  tableRate: { color: colors.textSecondary, fontSize: 12 },
  tableFee: { color: colors.primary, fontSize: 15, fontWeight: '700' },
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
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  changeTableButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedTableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
  },
});

