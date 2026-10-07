import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import {
  ReservationTimeRangePicker,
  timeToMinutes,
  minutesToTime,
  formatTimeLabel,
  formatDurationLabel,
  buildDayPeriods,
  getPeriodForTime,
} from '../ReservationTimeRangePicker';
import type { SlotAvailabilityData, Table } from '@/services/api';
import { colors } from '@/theme';

describe('ReservationTimeRangePicker helpers', () => {
  test('timeToMinutes converts HH:mm correctly', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('11:30')).toBe(690);
    expect(timeToMinutes('12:00')).toBe(720);
    expect(timeToMinutes('13:30')).toBe(810);
    expect(timeToMinutes('22:00')).toBe(1320);
  });

  test('minutesToTime formats into 24h string', () => {
    expect(minutesToTime(480)).toBe('08:00');
    expect(minutesToTime(690)).toBe('11:30');
    expect(minutesToTime(720)).toBe('12:00');
    expect(minutesToTime(810)).toBe('13:30');
  });

  test('formatTimeLabel converts to 12h AM/PM label', () => {
    expect(formatTimeLabel('08:00')).toBe('8:00 AM');
    expect(formatTimeLabel('11:30')).toBe('11:30 AM');
    expect(formatTimeLabel('12:00')).toBe('12:00 PM');
    expect(formatTimeLabel('13:30')).toBe('1:30 PM');
    expect(formatTimeLabel('17:00')).toBe('5:00 PM');
    expect(formatTimeLabel('21:30')).toBe('9:30 PM');
  });

  test('formatDurationLabel formats durations', () => {
    expect(formatDurationLabel(30)).toBe('30 min');
    expect(formatDurationLabel(60)).toBe('1 hr');
    expect(formatDurationLabel(90)).toBe('1 hr 30 min');
    expect(formatDurationLabel(120)).toBe('2 hrs');
    expect(formatDurationLabel(150)).toBe('2 hrs 30 min');
  });

  test('buildDayPeriods creates Morning, Afternoon, Evening groups with 30-min intervals', () => {
    const periods = buildDayPeriods();
    expect(periods).toHaveLength(3);

    // Morning
    expect(periods[0].id).toBe('morning');
    expect(periods[0].title).toBe('Morning');
    expect(periods[0].rangeLabel).toBe('8:00 AM – 11:30 AM');
    expect(periods[0].slots[0].value).toBe('08:00');
    expect(periods[0].slots[periods[0].slots.length - 1].value).toBe('11:30');

    // Afternoon
    expect(periods[1].id).toBe('afternoon');
    expect(periods[1].title).toBe('Afternoon');
    expect(periods[1].rangeLabel).toBe('12:00 PM – 4:30 PM');
    expect(periods[1].slots[0].value).toBe('12:00');
    expect(periods[1].slots[periods[1].slots.length - 1].value).toBe('16:30');

    // Evening
    expect(periods[2].id).toBe('evening');
    expect(periods[2].title).toBe('Evening');
    expect(periods[2].rangeLabel).toBe('5:00 PM – 9:30 PM');
    expect(periods[2].slots[0].value).toBe('17:00');
    expect(periods[2].slots[periods[2].slots.length - 1].value).toBe('21:30');
  });

  test('getPeriodForTime maps times to morning, afternoon, evening', () => {
    expect(getPeriodForTime('08:00')).toBe('morning');
    expect(getPeriodForTime('11:30')).toBe('morning');
    expect(getPeriodForTime('12:00')).toBe('afternoon');
    expect(getPeriodForTime('16:30')).toBe('afternoon');
    expect(getPeriodForTime('17:00')).toBe('evening');
    expect(getPeriodForTime('21:30')).toBe('evening');
  });
});

describe('ReservationTimeRangePicker collapsible options component', () => {
  const mockTable: Table = {
    id: 'tbl-4',
    tableNumber: '04',
    capacity: 4,
    hourlyReservationRate: 300,
    location: 'Window',
    status: 'available',
    restaurantId: 'rest-1',
    isActive: true,
  };

  const mockSlotData: SlotAvailabilityData = {
    date: '2026-10-10',
    partySize: 4,
    tableId: 'tbl-4',
    startSlots: [
      { time: '08:00', timeLabel: '8:00 AM', available: true, tableCount: 1 },
      { time: '08:30', timeLabel: '8:30 AM', available: false, tableCount: 0 },
      { time: '09:00', timeLabel: '9:00 AM', available: true, tableCount: 1 },
      { time: '12:00', timeLabel: '12:00 PM', available: true, tableCount: 1 },
      { time: '12:30', timeLabel: '12:30 PM', available: false, tableCount: 0 },
      { time: '17:00', timeLabel: '5:00 PM', available: true, tableCount: 1 },
      { time: '17:30', timeLabel: '5:30 PM', available: true, tableCount: 1 },
    ],
    endSlots: [
      { time: '12:30', timeLabel: '12:30 PM', durationMinutes: 30, available: true, tableCount: 1 },
      { time: '13:00', timeLabel: '1:00 PM', durationMinutes: 60, available: true, tableCount: 1 },
      { time: '13:30', timeLabel: '1:30 PM', durationMinutes: 90, available: true, tableCount: 1 },
      { time: '14:00', timeLabel: '2:00 PM', durationMinutes: 120, available: false, tableCount: 0 }, // Conflict with next booking
    ],
  };

  test('renders 3 collapsible options with time ranges next to the options', () => {
    render(
      <ReservationTimeRangePicker
        startTime="12:00"
        durationMinutes={60}
        onStartTimeChange={jest.fn()}
        onDurationChange={jest.fn()}
      />,
    );

    // Collapsible option headers with titles and time ranges
    expect(screen.getByText('Morning')).toBeTruthy();
    expect(screen.getByText('8:00 AM – 11:30 AM')).toBeTruthy();

    expect(screen.getByText('Afternoon')).toBeTruthy();
    expect(screen.getByText('12:00 PM – 4:30 PM')).toBeTruthy();

    expect(screen.getByText('Evening')).toBeTruthy();
    expect(screen.getByText('5:00 PM – 9:30 PM')).toBeTruthy();

    // Default expanded is Afternoon because startTime="12:00"
    expect(screen.getByTestId('period-content-afternoon')).toBeTruthy();
    expect(screen.queryByTestId('period-content-morning')).toBeNull();
    expect(screen.queryByTestId('period-content-evening')).toBeNull();
  });

  test('clicking an option shows just the available times for that range', () => {
    const onStartTimeChange = jest.fn();

    render(
      <ReservationTimeRangePicker
        startTime="12:00"
        durationMinutes={60}
        onStartTimeChange={onStartTimeChange}
        onDurationChange={jest.fn()}
        slotData={mockSlotData}
      />,
    );

    // Afternoon is open initially
    expect(screen.getByTestId('period-content-afternoon')).toBeTruthy();
    expect(screen.queryByTestId('period-content-morning')).toBeNull();

    // Click Morning option header
    fireEvent.press(screen.getByTestId('period-header-morning'));

    // Morning is now expanded showing its slots, Afternoon is collapsed
    expect(screen.getByTestId('period-content-morning')).toBeTruthy();
    expect(screen.queryByTestId('period-content-afternoon')).toBeNull();

    // Morning slots are visible (e.g. 8:00 AM, 9:00 AM)
    expect(screen.getByText('8:00 AM')).toBeTruthy();
    expect(screen.getByText('9:00 AM')).toBeTruthy();

    // Click on 8:00 AM slot
    fireEvent.press(screen.getByTestId('slot-08:00'));
    expect(onStartTimeChange).toHaveBeenCalledWith('08:00');

    // Click Evening option header
    fireEvent.press(screen.getByTestId('period-header-evening'));

    // Evening is now expanded, Morning collapsed
    expect(screen.getByTestId('period-content-evening')).toBeTruthy();
    expect(screen.queryByTestId('period-content-morning')).toBeNull();
    expect(screen.getByText('5:00 PM')).toBeTruthy();
  });

  test('greys out unavailable time slots and mentions Reserved within the greyed outs', () => {
    render(
      <ReservationTimeRangePicker
        startTime="12:00"
        durationMinutes={60}
        onStartTimeChange={jest.fn()}
        onDurationChange={jest.fn()}
        slotData={mockSlotData}
      />,
    );

    // In Afternoon: 12:00 is available, 12:30 is unavailable
    const slot1200 = screen.getByTestId('slot-12:00');
    const slot1230 = screen.getByTestId('slot-12:30');

    expect(slot1200.props.accessibilityState.disabled).toBe(false);
    expect(slot1230.props.accessibilityState.disabled).toBe(true);

    // 12:30 PM slot explicitly mentions "Reserved" in red
    const reservedLabel = within(slot1230).getByText('Reserved');
    expect(reservedLabel).toBeTruthy();
    expect(reservedLabel.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: colors.danger }),
      ]),
    );
    expect(within(slot1200).queryByText('Reserved')).toBeNull();
  });

  test('renders HOW LONG duration option as usual and disables conflicting durations', () => {
    const onDurationChange = jest.fn();

    render(
      <ReservationTimeRangePicker
        startTime="12:00"
        durationMinutes={60}
        onStartTimeChange={jest.fn()}
        onDurationChange={onDurationChange}
        slotData={mockSlotData}
      />,
    );

    expect(screen.getByText('HOW LONG?')).toBeTruthy();

    const dur30 = screen.getByTestId('duration-30');
    const dur60 = screen.getByTestId('duration-60');
    const dur120 = screen.getByTestId('duration-120'); // Unavailable per mockSlotData endSlots

    expect(dur30.props.accessibilityState.disabled).toBe(false);
    expect(dur60.props.accessibilityState.disabled).toBe(false);
    expect(dur120.props.accessibilityState.disabled).toBe(true);
    expect(within(dur120).getByText('Reserved')).toBeTruthy();

    // Tapping 90 min triggers onDurationChange
    const dur90 = screen.getByTestId('duration-90');
    fireEvent.press(dur90);
    expect(onDurationChange).toHaveBeenCalledWith(90);
  });

  test('displays compact reservation summary and calculates end time + fee', () => {
    render(
      <ReservationTimeRangePicker
        startTime="11:30"
        durationMinutes={120} // 2 hours
        onStartTimeChange={jest.fn()}
        onDurationChange={jest.fn()}
        selectedTable={mockTable}
        hourlyRate={300}
      />,
    );

    const summary = screen.getByTestId('reservation-summary');
    expect(summary).toBeTruthy();
    expect(within(summary).getByText(/11:30 AM → 1:30 PM/)).toBeTruthy();
    expect(within(summary).getByText(/Table 04/)).toBeTruthy();
    expect(within(summary).getByText('Rs. 600')).toBeTruthy(); // 300 * 2 hr = 600
    expect(within(summary).getByText('30 min · No charge')).toBeTruthy();
  });

  test('toggles compact turnaround buffer information details', () => {
    render(
      <ReservationTimeRangePicker
        startTime="10:00"
        durationMinutes={60}
        onStartTimeChange={jest.fn()}
        onDurationChange={jest.fn()}
        selectedTable={mockTable}
      />,
    );

    expect(screen.queryByText(/table sanitisation and preparation/)).toBeNull();

    // Tap buffer badge
    const badge = screen.getByLabelText('Turnaround buffer info');
    fireEvent.press(badge);

    expect(screen.getByText(/table sanitisation and preparation/)).toBeTruthy();

    // Tap again to collapse
    fireEvent.press(badge);
    expect(screen.queryByText(/table sanitisation and preparation/)).toBeNull();
  });
});
