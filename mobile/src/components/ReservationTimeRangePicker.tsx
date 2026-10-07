import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, SectionTitle } from '@/components/ui';
import type { SlotAvailabilityData, Table } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

/** Convert "HH:mm" to total minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = (time || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Convert total minutes from midnight to "HH:mm" string. */
export function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(1439, mins));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format "HH:mm" into customer-friendly "h:mm A" label (e.g. "11:30 AM"). */
export function formatTimeLabel(time: string): string {
  const [hours, minutes] = (time || '').split(':').map(Number);
  if (Number.isNaN(hours)) return time || '';
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes ?? 0).padStart(2, '0')} ${meridiem}`;
}

/** Format duration minutes into readable label (e.g. "1 hr 30 min", "2 hrs"). */
export function formatDurationLabel(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hrs > 0 && remaining > 0) {
    return `${hrs} hr${hrs > 1 ? 's' : ''} ${remaining} min`;
  }
  if (hrs > 0) {
    return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  }
  return `${remaining} min`;
}

export type DayPeriodId = 'morning' | 'afternoon' | 'evening';

export interface TimeSlotOption {
  value: string;
  label: string;
}

export interface DayPeriod {
  id: DayPeriodId;
  title: string;
  rangeLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  slots: TimeSlotOption[];
}

/** Generate Day Periods: Morning, Afternoon, Evening with 30-minute intervals. */
export function buildDayPeriods(): DayPeriod[] {
  const morningSlots: TimeSlotOption[] = [];
  const afternoonSlots: TimeSlotOption[] = [];
  const eveningSlots: TimeSlotOption[] = [];

  for (let m = 480; m <= 1290; m += 30) {
    const value = minutesToTime(m);
    const label = formatTimeLabel(value);
    const slot = { value, label };

    if (m < 720) {
      // 8:00 AM - 11:30 AM (480 - 690 min)
      morningSlots.push(slot);
    } else if (m < 1020) {
      // 12:00 PM - 4:30 PM (720 - 990 min)
      afternoonSlots.push(slot);
    } else {
      // 5:00 PM - 9:30 PM (1020 - 1290 min)
      eveningSlots.push(slot);
    }
  }

  return [
    {
      id: 'morning',
      title: 'Morning',
      rangeLabel: '8:00 AM – 11:30 AM',
      icon: 'sunny-outline',
      slots: morningSlots,
    },
    {
      id: 'afternoon',
      title: 'Afternoon',
      rangeLabel: '12:00 PM – 4:30 PM',
      icon: 'partly-sunny-outline',
      slots: afternoonSlots,
    },
    {
      id: 'evening',
      title: 'Evening',
      rangeLabel: '5:00 PM – 9:30 PM',
      icon: 'moon-outline',
      slots: eveningSlots,
    },
  ];
}

/** Determine which day period a time belongs to. */
export function getPeriodForTime(time: string): DayPeriodId {
  const min = timeToMinutes(time);
  if (min < 720) return 'morning';
  if (min < 1020) return 'afternoon';
  return 'evening';
}

/** Standard duration choices from 30 min to 4 hours in 30-min increments. */
export const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hr' },
  { minutes: 90, label: '1 hr 30 min' },
  { minutes: 120, label: '2 hrs' },
  { minutes: 150, label: '2 hrs 30 min' },
  { minutes: 180, label: '3 hrs' },
  { minutes: 210, label: '3 hrs 30 min' },
  { minutes: 240, label: '4 hrs' },
];

export interface ReservationTimeRangePickerProps {
  title?: string;
  startTime: string;
  durationMinutes: number;
  onStartTimeChange: (newStartTime: string) => void;
  onDurationChange: (newDurationMinutes: number) => void;
  slotData?: SlotAvailabilityData | null;
  isLoading?: boolean;
  selectedTable?: Table | null;
  hourlyRate?: number;
}

export function ReservationTimeRangePicker({
  title = 'Reservation Time',
  startTime,
  durationMinutes,
  onStartTimeChange,
  onDurationChange,
  slotData,
  isLoading = false,
  selectedTable,
  hourlyRate = 300,
}: ReservationTimeRangePickerProps) {
  const periods = useMemo(() => buildDayPeriods(), []);

  // Active expanded period: default to the period containing current startTime
  const initialPeriod = useMemo(() => (startTime ? getPeriodForTime(startTime) : 'afternoon'), [startTime]);
  const [expandedPeriod, setExpandedPeriod] = useState<DayPeriodId | null>(initialPeriod);
  const [showBufferInfo, setShowBufferInfo] = useState(false);

  // Sync expanded period if startTime is modified externally
  useEffect(() => {
    if (startTime) {
      const p = getPeriodForTime(startTime);
      setExpandedPeriod((curr) => (curr === null ? p : curr));
    }
  }, [startTime]);

  // Map of start slot availability from backend
  const startSlotAvailabilityMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (slotData?.startSlots) {
      for (const s of slotData.startSlots) {
        map.set(s.time, s.available);
      }
    }
    return map;
  }, [slotData?.startSlots]);

  // Map of duration availability for the chosen start time
  const durationAvailabilityMap = useMemo(() => {
    const map = new Map<number, boolean>();
    const startMin = timeToMinutes(startTime);

    for (const opt of DURATION_OPTIONS) {
      const endMin = startMin + opt.minutes;
      // Operating hours end at 10:00 PM (1320 min)
      if (endMin > 1320) {
        map.set(opt.minutes, false);
        continue;
      }

      // Check slotData endSlots calculated by availability engine
      if (slotData?.endSlots && slotData.endSlots.length > 0) {
        const matchingEndSlot = slotData.endSlots.find((e) => e.durationMinutes === opt.minutes);
        if (matchingEndSlot) {
          map.set(opt.minutes, matchingEndSlot.available);
        } else {
          map.set(opt.minutes, false);
        }
      } else {
        map.set(opt.minutes, endMin <= 1320);
      }
    }
    return map;
  }, [startTime, slotData?.endSlots]);

  // Handle start time selection & smart duration preservation/clearing
  function handleSelectStartTime(newStart: string) {
    onStartTimeChange(newStart);

    // Keep active expanded period aligned
    setExpandedPeriod(getPeriodForTime(newStart));

    // Re-evaluate current duration against new start time
    const newStartMin = timeToMinutes(newStart);
    const newEndMin = newStartMin + durationMinutes;

    if (durationMinutes > 0) {
      const exceedsClosing = newEndMin > 1320;
      let isStillAvailable = !exceedsClosing;

      if (slotData?.endSlots && slotData.endSlots.length > 0) {
        const slot = slotData.endSlots.find((e) => e.durationMinutes === durationMinutes);
        if (slot) {
          isStillAvailable = slot.available;
        }
      }

      if (!isStillAvailable) {
        onDurationChange(0);
      }
    }
  }

  // Toggle period accordion: clicking one expands it and collapses others
  function handleTogglePeriod(periodId: DayPeriodId) {
    setExpandedPeriod((curr) => (curr === periodId ? null : periodId));
  }

  // Calculated End Time and Pricing
  const { endTime, durationLabel, reservationFee } = useMemo(() => {
    if (!startTime || !durationMinutes) {
      return { endTime: startTime, durationLabel: '', reservationFee: 0 };
    }

    const sMin = timeToMinutes(startTime);
    const eMin = Math.min(1320, sMin + durationMinutes);
    const calculatedEndTime = minutesToTime(eMin);
    const durHours = durationMinutes / 60;
    const fee = Math.round(hourlyRate * durHours);

    return {
      endTime: calculatedEndTime,
      durationLabel: formatDurationLabel(durationMinutes),
      reservationFee: fee,
    };
  }, [startTime, durationMinutes, hourlyRate]);

  return (
    <Card style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <SectionTitle>{title}</SectionTitle>
        {startTime ? (
          <View style={styles.activePill}>
            <Ionicons name="time-outline" size={13} color={colors.primary} />
            <AppText variant="caption" style={styles.activePillText}>
              {formatTimeLabel(startTime)}
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText variant="caption" style={styles.subtitle}>
        {selectedTable
          ? `Select start time and duration for Table ${selectedTable.tableNumber}. Unavailable times are greyed out.`
          : 'Select start time and duration. Operating hours: 8:00 AM – 10:00 PM.'}
      </AppText>

      {/* Compact Turnaround Buffer Notice */}
      <View style={styles.bufferContainer}>
        <Pressable
          onPress={() => setShowBufferInfo((prev) => !prev)}
          style={styles.bufferBadge}
          accessibilityRole="button"
          accessibilityLabel="Turnaround buffer info"
        >
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <AppText variant="caption" style={styles.bufferText}>
            30-min turnaround buffer after every reservation · No charge
          </AppText>
          <Ionicons
            name={showBufferInfo ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.textSecondary}
          />
        </Pressable>

        {showBufferInfo ? (
          <View style={styles.bufferExpandedBox}>
            <AppText variant="caption" style={styles.bufferExpandedText}>
              A mandatory 30-minute turnaround buffer is automatically scheduled after each
              reservation for table sanitisation and preparation. Buffer time is not charged.
            </AppText>
          </View>
        ) : null}
      </View>

      {/* 1. START TIME: 3 Collapsible Options (Morning, Afternoon, Evening) */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionLabelRow}>
          <AppText variant="label" style={styles.sectionLabel}>
            START TIME
          </AppText>
          <AppText variant="caption" style={styles.sectionHint}>
            Tap a time range to view available slots
          </AppText>
        </View>

        <View style={styles.accordionContainer}>
          {periods.map((period) => {
            const isExpanded = expandedPeriod === period.id;
            const periodStartTimeMatch =
              startTime && getPeriodForTime(startTime) === period.id;

            return (
              <View
                key={period.id}
                style={[
                  styles.accordionItem,
                  isExpanded && styles.accordionItemExpanded,
                  periodStartTimeMatch && styles.accordionItemActiveMatch,
                ]}
              >
                <Pressable
                  onPress={() => handleTogglePeriod(period.id)}
                  style={[
                    styles.accordionHeader,
                    isExpanded && styles.accordionHeaderExpanded,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  accessibilityLabel={`${period.title}, ${period.rangeLabel}`}
                  testID={`period-header-${period.id}`}
                >
                  <View style={styles.accordionHeaderLeft}>
                    <View
                      style={[
                        styles.periodIconBox,
                        isExpanded && styles.periodIconBoxExpanded,
                        periodStartTimeMatch && styles.periodIconBoxMatch,
                      ]}
                    >
                      <Ionicons
                        name={period.icon}
                        size={16}
                        color={
                          isExpanded || periodStartTimeMatch
                            ? colors.primary
                            : colors.textSecondary
                        }
                      />
                    </View>

                    <AppText
                      variant="label"
                      style={[
                        styles.periodTitle,
                        (isExpanded || periodStartTimeMatch) && styles.periodTitleHighlighted,
                      ]}
                    >
                      {period.title}
                    </AppText>

                    <AppText variant="caption" style={styles.periodRangeText}>
                      {period.rangeLabel}
                    </AppText>
                  </View>

                  <View style={styles.accordionHeaderRight}>
                    {periodStartTimeMatch && !isExpanded ? (
                      <View style={styles.headerSelectedBadge}>
                        <AppText variant="caption" style={styles.headerSelectedText}>
                          {formatTimeLabel(startTime)}
                        </AppText>
                      </View>
                    ) : null}
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={isExpanded ? colors.primary : colors.textSecondary}
                    />
                  </View>
                </Pressable>

                {/* When clicked, just show the available times for that range */}
                {isExpanded ? (
                  <View
                    style={styles.accordionBody}
                    testID={`period-content-${period.id}`}
                  >
                    <View style={styles.gridContainer}>
                      {period.slots.map((st) => {
                        const isSelected = startTime === st.value;
                        const isAvailable = startSlotAvailabilityMap.has(st.value)
                          ? Boolean(startSlotAvailabilityMap.get(st.value))
                          : true;

                        return (
                          <Pressable
                            key={st.value}
                            disabled={!isAvailable}
                            onPress={() => handleSelectStartTime(st.value)}
                            style={[
                              styles.slotButton,
                              isSelected && styles.slotButtonSelected,
                              !isAvailable && styles.slotButtonDisabled,
                            ]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
                            accessibilityLabel={`${st.label}${!isAvailable ? ' reserved' : ''}`}
                            testID={`slot-${st.value}`}
                          >
                            <AppText
                              variant="caption"
                              style={[
                                styles.slotButtonText,
                                isSelected && styles.slotButtonTextSelected,
                                !isAvailable && styles.slotButtonTextDisabled,
                              ]}
                            >
                              {st.label}
                            </AppText>
                            {!isAvailable ? (
                              <AppText variant="caption" style={styles.slotReservedText}>
                                Reserved
                              </AppText>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {/* 2. DURATION SELECTION: "HOW LONG" option as usual */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionLabelRow}>
          <AppText variant="label" style={styles.sectionLabel}>
            HOW LONG?
          </AppText>
          {durationMinutes > 0 ? (
            <AppText variant="caption" style={styles.selectedStartIndicator}>
              Selected:{' '}
              <AppText variant="label" style={{ color: colors.primary }}>
                {formatDurationLabel(durationMinutes)}
              </AppText>
            </AppText>
          ) : (
            <AppText variant="caption" style={styles.sectionHint}>
              Select reservation length
            </AppText>
          )}
        </View>

        <View style={styles.gridContainer}>
          {DURATION_OPTIONS.map((opt) => {
            const isSelected = durationMinutes === opt.minutes;
            const isAvailable = Boolean(durationAvailabilityMap.get(opt.minutes));

            // Calculated end time for this duration button
            const optStartMin = timeToMinutes(startTime);
            const optEndMin = optStartMin + opt.minutes;
            const optEndTime =
              optEndMin <= 1320 ? formatTimeLabel(minutesToTime(optEndMin)) : null;

            return (
              <Pressable
                key={opt.minutes}
                disabled={!isAvailable}
                onPress={() => onDurationChange(opt.minutes)}
                style={[
                  styles.slotButton,
                  styles.durationButton,
                  isSelected && styles.slotButtonSelected,
                  !isAvailable && styles.slotButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: !isAvailable }}
                accessibilityLabel={`${opt.label}${!isAvailable ? ' unavailable' : ''}`}
                testID={`duration-${opt.minutes}`}
              >
                <AppText
                  variant="label"
                  style={[
                    styles.slotButtonText,
                    isSelected && styles.slotButtonTextSelected,
                    !isAvailable && styles.slotButtonTextDisabled,
                  ]}
                >
                  {opt.label}
                </AppText>
                {isAvailable && optEndTime ? (
                  <AppText
                    variant="caption"
                    style={[
                      styles.durationEndTimeSub,
                      isSelected && styles.durationEndTimeSubSelected,
                    ]}
                  >
                    until {optEndTime}
                  </AppText>
                ) : (
                  <AppText variant="caption" style={styles.unavailableBadge}>
                    {optEndMin > 1320 ? 'Past 10 PM' : 'Reserved'}
                  </AppText>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 3. COMPACT RESERVATION SUMMARY */}
      {startTime && durationMinutes > 0 ? (
        <View style={styles.summaryBox} testID="reservation-summary">
          <View style={styles.summaryHeaderRow}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <AppText variant="label" style={styles.summaryTitle}>
              YOUR RESERVATION
            </AppText>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <AppText variant="secondary">Table:</AppText>
            <AppText variant="label">
              {selectedTable ? `Table ${selectedTable.tableNumber}` : 'Assigned table'}
              {selectedTable?.capacity ? ` · Seats up to ${selectedTable.capacity}` : ''}
            </AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText variant="secondary">Time Range:</AppText>
            <AppText variant="label" style={styles.summaryTimeText}>
              {formatTimeLabel(startTime)} → {formatTimeLabel(endTime)} ({durationLabel})
            </AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText variant="secondary">Reservation Fee:</AppText>
            <AppText variant="heading" style={styles.summaryFeeText}>
              Rs. {reservationFee}
            </AppText>
          </View>

          <View style={styles.summaryRow}>
            <AppText variant="secondary">Turnaround Buffer:</AppText>
            <AppText variant="caption" style={styles.summaryBufferText}>
              30 min · No charge
            </AppText>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft || '#F7E7E9',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  activePillText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  bufferContainer: {
    gap: spacing.xs,
  },
  bufferBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bufferText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  bufferExpandedBox: {
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  bufferExpandedText: {
    color: colors.textSecondary,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: spacing.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionLabel: {
    letterSpacing: 0.8,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  selectedStartIndicator: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  accordionContainer: {
    gap: spacing.xs,
  },
  accordionItem: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  accordionItemExpanded: {
    borderColor: colors.primary,
  },
  accordionItemActiveMatch: {
    borderColor: colors.primarySoft || colors.primary,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  accordionHeaderExpanded: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  periodIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodIconBoxExpanded: {
    backgroundColor: colors.primarySoft || '#F7E7E9',
  },
  periodIconBoxMatch: {
    backgroundColor: colors.primarySoft || '#F7E7E9',
  },
  periodTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  periodTitleHighlighted: {
    color: colors.primary,
    fontWeight: '700',
  },
  periodRangeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerSelectedBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  headerSelectedText: {
    color: colors.textOnPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  accordionBody: {
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  slotButton: {
    width: '31.8%',
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  slotReservedText: {
    fontSize: 10,
    color: colors.danger,
    fontWeight: '700',
    marginTop: 1,
  },
  slotButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  slotButtonText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  slotButtonTextSelected: {
    color: colors.textOnPrimary,
  },
  slotButtonTextDisabled: {
    color: colors.textMuted,
    opacity: 0.6,
    textDecorationLine: 'line-through',
  },
  durationButton: {
    minHeight: 52,
    paddingVertical: 6,
  },
  durationEndTimeSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  durationEndTimeSubSelected: {
    color: colors.textOnPrimary,
    opacity: 0.9,
  },
  unavailableBadge: {
    fontSize: 10,
    color: colors.danger,
    marginTop: 2,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs + 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    marginTop: spacing.xs,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryTitle: {
    letterSpacing: 0.5,
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTimeText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  summaryFeeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryBufferText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
