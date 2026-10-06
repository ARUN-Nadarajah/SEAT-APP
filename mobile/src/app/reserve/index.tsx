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
  fetchSlotAvailability,
  fetchTables,
  type Table,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

/** Generate next 30 days (Section 9: up to 30 days advance booking). */
function nextDays(count = 30): { value: string; weekday: string; day: string; month: string }[] {
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

/** 8:00 AM (480 min) to 9:30 PM (1290 min) in 30-min increments (Section 3 & 4). */
function generateStartTimes(): { value: string; label: string }[] {
  const times: { value: string; label: string }[] = [];
  for (let m = 480; m <= 1290; m += 30) {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    const value = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const meridiem = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const label = `${hour12}:${String(mins).padStart(2, '0')} ${meridiem}`;
    times.push({ value, label });
  }
  return times;
}

/** Minimum 30 min duration after start, up to 10:00 PM (1320 min) (Section 3 & 4). */
function generateEndTimes(startValue: string): { value: string; label: string; durationLabel: string }[] {
  const times: { value: string; label: string; durationLabel: string }[] = [];
  const [sH, sM] = startValue.split(':').map(Number);
  const startMin = (sH || 0) * 60 + (sM || 0);

  for (let m = startMin + 30; m <= 1320; m += 30) {
    const hours = Math.floor(m / 60);
    const mins = m % 60;
    const value = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const meridiem = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const label = `${hour12}:${String(mins).padStart(2, '0')} ${meridiem}`;

    const diff = m - startMin;
    const hoursPart = Math.floor(diff / 60);
    const minsPart = diff % 60;
    let durationLabel = '';
    if (hoursPart > 0 && minsPart > 0) {
      durationLabel = `${hoursPart}h ${minsPart}m`;
    } else if (hoursPart > 0) {
      durationLabel = `${hoursPart} hr${hoursPart > 1 ? 's' : ''}`;
    } else {
      durationLabel = `${minsPart} min`;
    }
    times.push({ value, label, durationLabel });
  }
  return times;
}

function formatSlotLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours)) return time;
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
}

export default function ReserveScreen() {
  const params = useLocalSearchParams<{
    restaurantId?: string;
    tableId?: string;
    tableNumber?: string;
    partySize?: string;
    tableCapacity?: string;
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

  const days = useMemo(() => nextDays(30), []);
  const startTimes = useMemo(() => generateStartTimes(), []);

  const [date, setDate] = useState(days[0].value);
  const [partySize, setPartySize] = useState(Number(params.partySize) || 2);
  const [startTime, setStartTime] = useState<string>('12:00');
  const [endTime, setEndTime] = useState<string>('13:30');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(params.tableId || null);
  const [isChangingTable, setIsChangingTable] = useState<boolean>(!params.tableId);
  const [specialRequest, setSpecialRequest] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const endTimes = useMemo(() => generateEndTimes(startTime), [startTime]);

  // Restaurant details query
  const restaurantQuery = useApiQuery(
    ['restaurant', restaurantId],
    () => fetchRestaurant(restaurantId),
    { enabled: Boolean(restaurantId) },
  );
  const restaurant = restaurantQuery.data?.data;

  // Venue tables query (table selection is priority)
  const tablesQuery = useApiQuery(
    ['restaurant-tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId) },
  );

  const allTables: Table[] = tablesQuery.data?.data ?? [];

  // Filter tables by capacity for the chosen party size
  const eligibleTables = useMemo(() => {
    return allTables
      .filter((t) => t.isActive !== false && t.status !== 'maintenance' && t.capacity >= partySize)
      .sort((a, b) => {
        if (a.capacity !== b.capacity) return a.capacity - b.capacity;
        return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true });
      });
  }, [allTables, partySize]);

  const selectedTable = useMemo(() => {
    if (!selectedTableId) return null;
    return allTables.find((t) => t.id === selectedTableId || t._id === selectedTableId) || null;
  }, [allTables, selectedTableId]);

  // If party size exceeds selected table's capacity, prompt user to select a suitable table
  useEffect(() => {
    if (selectedTable && selectedTable.capacity < partySize) {
      setIsChangingTable(true);
    }
  }, [selectedTable, partySize]);

  // Slot availability query (Greys out unavailable slots FOR THE SELECTED TABLE)
  const slotAvailabilityQuery = useApiQuery(
    ['slot-availability', restaurantId, date, partySize, selectedTableId, startTime],
    async () => {
      if (!restaurantId || !date) return null;
      const res = await fetchSlotAvailability({
        restaurantId,
        date,
        partySize,
        tableId: selectedTableId || undefined,
        startTime: startTime || undefined,
      });
      return res.data ?? null;
    },
    {
      enabled: Boolean(restaurantId && date && partySize > 0),
    },
  );

  const slotData = slotAvailabilityQuery.data;

  // Ensure startTime is available; if current is unavailable, auto-select first free
  useEffect(() => {
    if (slotData?.startSlots && slotData.startSlots.length > 0) {
      const current = slotData.startSlots.find((s) => s.time === startTime);
      if (current && !current.available) {
        const firstFree = slotData.startSlots.find((s) => s.available);
        if (firstFree) {
          setStartTime(firstFree.time);
        }
      }
    }
  }, [slotData, startTime]);

  // Ensure endTime is valid & available when startTime or slotData changes
  useEffect(() => {
    const validEnds = generateEndTimes(startTime);
    if (!validEnds.some((e) => e.value === endTime)) {
      setEndTime(validEnds[1]?.value || validEnds[0]?.value || '13:00');
    } else if (slotData?.endSlots && slotData.endSlots.length > 0) {
      const currentEnd = slotData.endSlots.find((e) => e.time === endTime);
      if (currentEnd && !currentEnd.available) {
        const firstFreeEnd = slotData.endSlots.find((e) => e.available);
        if (firstFreeEnd) {
          setEndTime(firstFreeEnd.time);
        }
      }
    }
  }, [startTime, slotData]);

  const { durationMinutes, durationHours, reservationFee } = useMemo(() => {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const startMin = (sH || 0) * 60 + (sM || 0);
    const endMin = (eH || 0) * 60 + (eM || 0);
    const durMins = Math.max(30, endMin - startMin);
    const durHours = durMins / 60;
    const hourlyRate = selectedTable?.hourlyReservationRate ?? 300;
    const fee = Math.round(hourlyRate * durHours);
    return { durationMinutes: durMins, durationHours: durHours, reservationFee: fee };
  }, [startTime, endTime, selectedTable]);

  function onReview() {
    if (!selectedTable) {
      setFormError('Please select a table to proceed with your reservation.');
      return;
    }
    if (selectedTable.capacity < partySize) {
      setFormError(`Table ${selectedTable.tableNumber} accommodates up to ${selectedTable.capacity} guests. Please select a table for ${partySize} guests.`);
      return;
    }
    setFormError(null);

    router.push({
      pathname: '/reserve/review',
      params: {
        restaurantId,
        partySize: String(partySize),
        date,
        startTime,
        endTime,
        time: startTime,
        specialRequest,
        tableId: selectedTable.id || selectedTable._id || '',
        tableNumber: selectedTable.tableNumber,
        tableCapacity: String(selectedTable.capacity),
        hourlyRate: String(selectedTable.hourlyReservationRate || 300),
        reservationFee: String(reservationFee),
        durationMinutes: String(durationMinutes),
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
            {restaurant ? restaurant.name : 'Real-time reservation'}
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
            {/* 1 — Which day? (Up to 30 days advance booking) */}
            <Card>
              <SectionTitle>1. Which day?</SectionTitle>
              <AppText variant="caption" style={styles.sectionSubtitle}>
                Bookings available up to 30 days in advance
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.days}
              >
                {days.map((day) => {
                  const selected = day.value === date;
                  return (
                    <Pressable
                      key={day.value}
                      onPress={() => {
                        setDate(day.value);
                        setSelectedTableId(null);
                        setFormError(null);
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

            {/* 2 — Party size */}
            <Card>
              <SectionTitle>2. Number of guests</SectionTitle>
              <View style={styles.partyRow}>
                {PARTY_SIZES.map((size) => (
                  <Pressable
                    key={size}
                    onPress={() => {
                      setPartySize(size);
                      setSelectedTableId(null);
                      setFormError(null);
                    }}
                    style={[styles.partyChip, partySize === size && styles.partyChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: partySize === size }}
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

            {/* 3 — Table Selection (Priority) */}
            {selectedTable && selectedTable.capacity >= partySize && !isChangingTable ? (
              <Card>
                <View style={styles.sectionHeaderRow}>
                  <SectionTitle>3. Your selected table</SectionTitle>
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
                        Seats up to {selectedTable.capacity} guests · {selectedTable.location || 'Indoor'}
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.tableCardRight}>
                    <AppText variant="caption" style={styles.tableRate}>
                      Rs. {selectedTable.hourlyReservationRate ?? 300}/hr
                    </AppText>
                    <AppText variant="label" style={styles.tableFee}>
                      Rs. {reservationFee}
                    </AppText>
                  </View>
                </View>
              </Card>
            ) : (
              <Card>
                <View style={styles.sectionHeaderRow}>
                  <SectionTitle>3. Select your table</SectionTitle>
                  {selectedTable && selectedTable.capacity >= partySize ? (
                    <Pressable onPress={() => setIsChangingTable(false)} hitSlop={8}>
                      <AppText variant="label" style={styles.changeTableButtonText}>
                        Keep Table {selectedTable.tableNumber}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>

                {selectedTable && selectedTable.capacity < partySize ? (
                  <View style={{ marginBottom: spacing.sm }}>
                    <InfoBox tone="warning">
                      <AppText variant="caption">
                        Table {selectedTable.tableNumber} accommodates up to {selectedTable.capacity} guests. Please select a table for {partySize} guests below:
                      </AppText>
                    </InfoBox>
                  </View>
                ) : (
                  <AppText variant="caption" style={styles.sectionSubtitle}>
                    Select a table to see its available reservation times
                  </AppText>
                )}

                {tablesQuery.isLoading ? (
                  <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                    <Skeleton height={72} radius={radius.md} />
                    <Skeleton height={72} radius={radius.md} />
                  </View>
                ) : tablesQuery.isError ? (
                  <ErrorState
                    message={apiErrorMessage(tablesQuery.error) || 'Failed to load restaurant tables.'}
                    onRetry={() => tablesQuery.refetch()}
                  />
                ) : eligibleTables.length === 0 ? (
                  <View style={{ marginTop: spacing.md }}>
                    <InfoBox tone="warning">
                      <AppText variant="label">No tables available</AppText>
                      <AppText variant="secondary">
                        No tables can seat {partySize} guests at this venue. Try a smaller party size.
                      </AppText>
                    </InfoBox>
                  </View>
                ) : (
                  <View style={styles.tableList}>
                    {eligibleTables.map((table) => {
                      const isSelected = (selectedTable?.id || selectedTable?._id) === (table.id || table._id);
                      return (
                        <Pressable
                          key={table.id || table._id}
                          onPress={() => {
                            setSelectedTableId(table.id || table._id || null);
                            setIsChangingTable(false);
                            setFormError(null);
                          }}
                          style={[styles.tableCard, isSelected && styles.tableCardSelected]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <View style={styles.tableCardLeft}>
                            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                              {isSelected ? (
                                <Ionicons name="checkmark" size={16} color={colors.textOnPrimary} />
                              ) : null}
                            </View>
                            <View style={{ gap: 2 }}>
                              <AppText variant="label" style={isSelected ? styles.tableTitleActive : undefined}>
                                Table {table.tableNumber}
                              </AppText>
                              <AppText variant="caption" style={styles.tableMeta}>
                                Seats up to {table.capacity} guests · {table.location || 'Indoor'}
                              </AppText>
                            </View>
                          </View>

                          <View style={styles.tableCardRight}>
                            <AppText variant="caption" style={styles.tableRate}>
                              Rs. {table.hourlyReservationRate ?? 300}/hr
                            </AppText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Card>
            )}

            {/* 4 — Time range: Start Time & End Time */}
            <Card>
              <View style={styles.sectionHeaderRow}>
                <SectionTitle>4. Reservation time range</SectionTitle>
                {slotAvailabilityQuery.isFetching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : null}
              </View>
              <AppText variant="caption" style={styles.sectionSubtitle}>
                {selectedTable
                  ? `Available times for Table ${selectedTable.tableNumber} · Greyed-out slots are already reserved`
                  : 'Operating hours: 8:00 AM – 10:00 PM · Greyed-out slots are unavailable'}
              </AppText>

              <InfoBox tone="info">
                <AppText variant="caption">
                  A mandatory 30-minute turnaround buffer is automatically scheduled after each reservation for table sanitisation and preparation.
                  Buffer time is not charged.
                </AppText>
              </InfoBox>

              <AppText variant="label" style={[styles.timeLabelHeading, { marginTop: spacing.sm }]}>
                Start Time
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeScroll}
              >
                {startTimes.map((st) => {
                  const isSelected = startTime === st.value;
                  const slotInfo = slotData?.startSlots?.find((s) => s.time === st.value);
                  const isAvailable = slotInfo ? slotInfo.available : true;

                  return (
                    <Pressable
                      key={st.value}
                      disabled={!isAvailable}
                      onPress={() => {
                        setStartTime(st.value);
                        setFormError(null);
                      }}
                      style={[
                        styles.timeChip,
                        isSelected && styles.timeChipActive,
                        !isAvailable && styles.timeChipDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
                      accessibilityLabel={`${st.label}${!isAvailable ? ' unavailable' : ''}`}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.timeChipText,
                          isSelected && styles.timeChipTextActive,
                          !isAvailable && styles.timeChipTextDisabled,
                        ]}
                      >
                        {st.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <AppText variant="label" style={[styles.timeLabelHeading, { marginTop: spacing.md }]}>
                End Time
              </AppText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.timeScroll}
              >
                {endTimes.map((et) => {
                  const isSelected = endTime === et.value;
                  const endSlotInfo = slotData?.endSlots?.find((e) => e.time === et.value);
                  const isAvailable = endSlotInfo ? endSlotInfo.available : true;

                  return (
                    <Pressable
                      key={et.value}
                      disabled={!isAvailable}
                      onPress={() => {
                        setEndTime(et.value);
                        setFormError(null);
                      }}
                      style={[
                        styles.timeChip,
                        isSelected && styles.timeChipActive,
                        !isAvailable && styles.timeChipDisabled,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
                      accessibilityLabel={`${et.label} (${et.durationLabel})${!isAvailable ? ' unavailable' : ''}`}
                    >
                      <AppText
                        variant="caption"
                        style={[
                          styles.timeChipText,
                          isSelected && styles.timeChipTextActive,
                          !isAvailable && styles.timeChipTextDisabled,
                        ]}
                      >
                        {et.label}
                      </AppText>
                      <AppText
                        variant="caption"
                        style={[
                          styles.timeChipSub,
                          isSelected && styles.timeChipSubActive,
                          !isAvailable && styles.timeChipSubDisabled,
                        ]}
                      >
                        {et.durationLabel}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>

            {/* 5 — Special request */}
            <Card>
              <SectionTitle>5. Special requests (optional)</SectionTitle>
              <Field
                label="Notes for the restaurant"
                value={specialRequest}
                onChangeText={setSpecialRequest}
                placeholder="High chair, birthday surprise, quiet booth…"
                multiline
                maxLength={300}
                hint="We’ll notify restaurant staff in advance."
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
          label={
            selectedTable && selectedTable.capacity >= partySize
              ? `Review booking · Rs. ${reservationFee}`
              : 'Select a table to continue'
          }
          onPress={onReview}
          disabled={!selectedTable || isChangingTable || selectedTable.capacity < partySize}
          testID="reserve-review"
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
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  sectionSubtitle: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  footer: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  partyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  partyChip: {
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
  timeLabelHeading: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  timeScroll: { gap: spacing.sm, paddingRight: spacing.lg },
  timeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  timeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  timeChipDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    opacity: 0.4,
  },
  timeChipText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  timeChipTextActive: {
    color: colors.textOnPrimary,
  },
  timeChipTextDisabled: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  timeChipSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timeChipSubActive: {
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
  timeChipSubDisabled: {
    color: colors.textMuted,
  },
  tableList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  tableCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  radioCircleSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  tableTitleActive: {
    color: colors.primary,
  },
  tableMeta: {
    color: colors.textSecondary,
  },
  tableCardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  tableRate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  tableFee: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
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

