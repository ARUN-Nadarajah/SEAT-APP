import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InfoBox,
  SectionTitle,
  Skeleton,
} from '@/components/ui';
import {
  ReservationTimeRangePicker,
  minutesToTime,
  timeToMinutes,
} from '@/components/ReservationTimeRangePicker';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchMenu,
  fetchRestaurant,
  fetchRestaurants,
  fetchSlotAvailability,
  fetchTables,
  type MenuItem,
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

  const [date, setDate] = useState(days[0].value);
  const [partySize, setPartySize] = useState(Number(params.partySize) || 2);
  const [startTime, setStartTime] = useState<string>('12:00');
  const [durationMinutes, setDurationMinutes] = useState<number>(90);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(params.tableId || null);
  const [isChangingTable, setIsChangingTable] = useState<boolean>(!params.tableId);
  const [specialRequest, setSpecialRequest] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Pre-ordered food items state
  const [cart, setCart] = useState<Record<string, { item: MenuItem; quantity: number; note?: string }>>({});
  const [menuModalVisible, setMenuModalVisible] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuFilterCategory, setMenuFilterCategory] = useState<string>('all');

  // Restaurant details query
  const restaurantQuery = useApiQuery(
    ['restaurant', restaurantId],
    () => fetchRestaurant(restaurantId),
    { enabled: Boolean(restaurantId) },
  );
  const restaurant = restaurantQuery.data?.data;

  // Restaurant menu query for pre-orders
  const menuQuery = useApiQuery(
    ['menu', restaurantId],
    () => fetchMenu(restaurantId),
    { enabled: Boolean(restaurantId) },
  );
  const menuCategories = menuQuery.data?.data?.categories ?? [];
  const menuItems = menuQuery.data?.data?.items ?? [];

  const cartLines = useMemo(() => Object.values(cart).filter((line) => line.quantity > 0), [cart]);
  const foodTotal = useMemo(
    () => cartLines.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0),
    [cartLines],
  );
  const foodItemCount = useMemo(
    () => cartLines.reduce((acc, curr) => acc + curr.quantity, 0),
    [cartLines],
  );

  function updateCartItem(item: MenuItem, delta: number) {
    const key = item.menuItemId ?? item.id ?? item._id ?? item.name;
    setCart((prev) => {
      const current = prev[key]?.quantity ?? 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      }
      return {
        ...prev,
        [key]: { item, quantity: next },
      };
    });
  }

  function removeCartItem(key: string) {
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }

  function clearCart() {
    setCart({});
  }

  const filteredMenuItems = useMemo(() => {
    let list = menuItems;
    if (menuFilterCategory !== 'all') {
      list = list.filter((i) => i.category === menuFilterCategory);
    }
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [menuItems, menuFilterCategory, menuSearch]);

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

  // Ensure duration is valid & available when startTime or slotData changes
  useEffect(() => {
    if (durationMinutes > 0) {
      const startMin = timeToMinutes(startTime);
      const endMin = startMin + durationMinutes;
      if (endMin > 1320) {
        setDurationMinutes(0);
        return;
      }
      if (slotData?.endSlots && slotData.endSlots.length > 0) {
        const currentEnd = slotData.endSlots.find((e) => e.durationMinutes === durationMinutes);
        if (currentEnd && !currentEnd.available) {
          const firstFreeEnd = slotData.endSlots.find((e) => e.available);
          if (firstFreeEnd && typeof firstFreeEnd.durationMinutes === 'number') {
            setDurationMinutes(firstFreeEnd.durationMinutes);
          } else {
            setDurationMinutes(0);
          }
        }
      }
    }
  }, [startTime, slotData]);

  const { endTime, durationHours, reservationFee } = useMemo(() => {
    const startMin = timeToMinutes(startTime);
    const endMin = Math.min(1320, startMin + (durationMinutes || 0));
    const calculatedEndTime = minutesToTime(endMin);
    const durHours = (durationMinutes || 0) / 60;
    const hourlyRate = selectedTable?.hourlyReservationRate ?? 300;
    const fee = Math.round(hourlyRate * durHours);
    return { endTime: calculatedEndTime, durationHours: durHours, reservationFee: fee };
  }, [startTime, durationMinutes, selectedTable]);

  function onReview() {
    if (!selectedTable) {
      setFormError('Please select a table to proceed with your reservation.');
      return;
    }
    if (selectedTable.capacity < partySize) {
      setFormError(`Table ${selectedTable.tableNumber} accommodates up to ${selectedTable.capacity} guests. Please select a table for ${partySize} guests.`);
      return;
    }
    if (!startTime) {
      setFormError('Please select a start time.');
      return;
    }
    if (!durationMinutes || durationMinutes < 30) {
      setFormError('Please select a reservation duration.');
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
        cart: JSON.stringify(
          cartLines.map((l) => ({
            ...l.item,
            menuItemId: l.item.menuItemId ?? l.item.id ?? l.item._id,
            quantity: l.quantity,
            note: l.note,
          })),
        ),
        foodTotal: String(foodTotal),
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

            {/* 4 — Reservation time range */}
            <ReservationTimeRangePicker
              title="4. Reservation time range"
              startTime={startTime}
              durationMinutes={durationMinutes}
              onStartTimeChange={(newStart) => {
                setStartTime(newStart);
                setFormError(null);
              }}
              onDurationChange={(newDur) => {
                setDurationMinutes(newDur);
                setFormError(null);
              }}
              slotData={slotData}
              isLoading={slotAvailabilityQuery.isFetching}
              selectedTable={selectedTable}
              hourlyRate={selectedTable?.hourlyReservationRate ?? 300}
            />

            {/* 5 — Pre-order food (optional) */}
            <Card>
              <View style={styles.sectionHeaderRow}>
                <SectionTitle>5. Pre-order food from menu (optional)</SectionTitle>
                {cartLines.length > 0 ? (
                  <Pressable onPress={clearCart} hitSlop={8}>
                    <AppText variant="caption" style={{ color: colors.danger, fontWeight: '600' }}>
                      Clear all
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <AppText variant="caption" style={styles.sectionSubtitle}>
                Choose dishes now so the kitchen prepares them fresh for your table arrival.
              </AppText>

              {cartLines.length === 0 ? (
                <View style={styles.emptyFoodCard}>
                  <Ionicons name="restaurant-outline" size={32} color={colors.primary} />
                  <AppText variant="bodyMedium" style={{ fontWeight: '600', textAlign: 'center' }}>
                    No food pre-ordered yet
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                    Skip waiting at the restaurant. You can choose meals from our full menu now.
                  </AppText>
                  <Button
                    label="Browse menu & choose food"
                    variant="secondary"
                    onPress={() => setMenuModalVisible(true)}
                    testID="open-food-modal"
                    style={{ marginTop: spacing.xs }}
                  />
                </View>
              ) : (
                <View style={styles.selectedFoodList}>
                  {cartLines.map(({ item, quantity }) => {
                    const key = item.menuItemId ?? item.id ?? item._id ?? item.name;
                    return (
                      <View key={key} style={styles.selectedFoodRow}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText variant="bodyMedium" style={{ fontWeight: '600' }}>
                            {item.name}
                          </AppText>
                          <AppText variant="caption" style={{ color: colors.textSecondary }}>
                            LKR {item.price.toLocaleString()} each · Subtotal: LKR {(item.price * quantity).toLocaleString()}
                          </AppText>
                        </View>
                        <View style={styles.foodQtyStepper}>
                          <Pressable
                            onPress={() => updateCartItem(item, -1)}
                            style={styles.foodQtyBtn}
                            hitSlop={8}
                            accessibilityLabel={`Decrease ${item.name}`}
                          >
                            <Ionicons name="remove" size={16} color={colors.primary} />
                          </Pressable>
                          <AppText variant="label" style={styles.foodQtyText}>
                            {quantity}
                          </AppText>
                          <Pressable
                            onPress={() => updateCartItem(item, 1)}
                            style={styles.foodQtyBtn}
                            hitSlop={8}
                            accessibilityLabel={`Increase ${item.name}`}
                          >
                            <Ionicons name="add" size={16} color={colors.primary} />
                          </Pressable>
                          <Pressable
                            onPress={() => removeCartItem(key)}
                            style={[styles.foodQtyBtn, { marginLeft: spacing.xs }]}
                            hitSlop={8}
                            accessibilityLabel={`Remove ${item.name}`}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.foodSubtotalDivider} />
                  <View style={styles.foodSubtotalRow}>
                    <AppText variant="label">Food Pre-order Total</AppText>
                    <AppText variant="heading" style={{ color: colors.primary }}>
                      LKR {foodTotal.toLocaleString()}
                    </AppText>
                  </View>

                  <Button
                    label="+ Add more dishes"
                    variant="secondary"
                    onPress={() => setMenuModalVisible(true)}
                    style={{ marginTop: spacing.xs }}
                  />
                </View>
              )}
            </Card>

            {/* 6 — Special request */}
            <Card>
              <SectionTitle>6. Special requests (optional)</SectionTitle>
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
            selectedTable && selectedTable.capacity >= partySize && durationMinutes >= 30
              ? foodTotal > 0
                ? `Review booking · Rs. ${reservationFee} + Food LKR ${foodTotal.toLocaleString()}`
                : `Review booking · Rs. ${reservationFee}`
              : selectedTable && selectedTable.capacity >= partySize && durationMinutes < 30
              ? 'Select duration to continue'
              : 'Select a table to continue'
          }
          onPress={onReview}
          disabled={
            !selectedTable ||
            isChangingTable ||
            selectedTable.capacity < partySize ||
            durationMinutes < 30 ||
            !startTime
          }
          testID="reserve-review"
        />
      </View>

      {/* Food Selection Modal */}
      <Modal
        visible={menuModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMenuModalVisible(false)}
      >
        <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">Choose Food from Menu</AppText>
              <AppText variant="caption">Pre-order for your table reservation</AppText>
            </View>
            <Pressable
              onPress={() => setMenuModalVisible(false)}
              style={styles.modalCloseBtn}
              hitSlop={10}
              accessibilityLabel="Close menu"
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={styles.modalSearchShell}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.modalSearchInput}
              value={menuSearch}
              onChangeText={setMenuSearch}
              placeholder="Search dishes or ingredients…"
              placeholderTextColor={colors.textMuted}
            />
            {menuSearch ? (
              <Pressable onPress={() => setMenuSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Categories row */}
          {menuCategories.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.modalCategoryRow}
            >
              <Pressable
                onPress={() => setMenuFilterCategory('all')}
                style={[
                  styles.modalCategoryChip,
                  menuFilterCategory === 'all' && styles.modalCategoryChipActive,
                ]}
              >
                <AppText
                  variant="caption"
                  style={[
                    styles.modalCategoryChipText,
                    menuFilterCategory === 'all' && styles.modalCategoryChipTextActive,
                  ]}
                >
                  All ({menuItems.length})
                </AppText>
              </Pressable>
              {menuCategories.map((cat) => (
                <Pressable
                  key={cat.name}
                  onPress={() => setMenuFilterCategory(cat.name)}
                  style={[
                    styles.modalCategoryChip,
                    menuFilterCategory === cat.name && styles.modalCategoryChipActive,
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={[
                      styles.modalCategoryChipText,
                      menuFilterCategory === cat.name && styles.modalCategoryChipTextActive,
                    ]}
                  >
                    {cat.name} ({cat.items.length})
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* Menu items list */}
          <ScrollView contentContainerStyle={styles.modalItemList} showsVerticalScrollIndicator={false}>
            {menuQuery.isLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
            ) : filteredMenuItems.length === 0 ? (
              <EmptyState
                title="No dishes found"
                message="Try adjusting your search or category filter."
                glyph="🍽️"
              />
            ) : (
              filteredMenuItems.map((item) => {
                const key = item.menuItemId ?? item.id ?? item._id ?? item.name;
                const qty = cart[key]?.quantity ?? 0;
                return (
                  <View key={key} style={styles.modalMenuItemCard}>
                    <View style={styles.modalItemLeft}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AppText variant="bodyMedium" style={{ fontWeight: '600' }}>
                          {item.name}
                        </AppText>
                        {item.isVegetarian ? (
                          <Badge label="Veg" tone="success" />
                        ) : null}
                      </View>
                      {item.description ? (
                        <AppText variant="caption" style={{ color: colors.textSecondary }} numberOfLines={2}>
                          {item.description}
                        </AppText>
                      ) : null}
                      <AppText variant="label" style={{ color: colors.primary, marginTop: 4 }}>
                        LKR {item.price.toLocaleString()}
                      </AppText>
                    </View>

                    <View style={styles.modalItemRight}>
                      {qty === 0 ? (
                        <Pressable
                          onPress={() => updateCartItem(item, 1)}
                          style={styles.modalAddBtn}
                          hitSlop={6}
                        >
                          <Ionicons name="add" size={18} color={colors.primary} />
                          <AppText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                            Add
                          </AppText>
                        </Pressable>
                      ) : (
                        <View style={styles.modalStepper}>
                          <Pressable
                            onPress={() => updateCartItem(item, -1)}
                            style={styles.modalStepBtn}
                            hitSlop={6}
                          >
                            <Ionicons name="remove" size={16} color={colors.primary} />
                          </Pressable>
                          <AppText variant="label" style={styles.modalStepQty}>
                            {qty}
                          </AppText>
                          <Pressable
                            onPress={() => updateCartItem(item, 1)}
                            style={styles.modalStepBtn}
                            hitSlop={6}
                          >
                            <Ionicons name="add" size={16} color={colors.primary} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Modal bottom bar */}
          <View style={styles.modalBottomBar}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: colors.textSecondary }}>
                {foodItemCount} {foodItemCount === 1 ? 'item' : 'items'} selected
              </AppText>
              <AppText variant="heading" style={{ color: colors.textPrimary }}>
                LKR {foodTotal.toLocaleString()}
              </AppText>
            </View>
            <Button
              label={foodItemCount > 0 ? 'Done adding food' : 'Close'}
              onPress={() => setMenuModalVisible(false)}
              style={{ minWidth: 160 }}
            />
          </View>
        </SafeAreaView>
      </Modal>
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
  emptyFoodCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  selectedFoodList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  selectedFoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  foodQtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  foodQtyBtn: {
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodQtyText: {
    minWidth: 24,
    textAlign: 'center',
    fontWeight: '700',
  },
  foodSubtotalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.xs,
  },
  foodSubtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  modalSearchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
    gap: spacing.xs,
  },
  modalSearchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  modalCategoryRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  modalCategoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalCategoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  modalCategoryChipText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalCategoryChipTextActive: {
    color: colors.textOnPrimary,
  },
  modalItemList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.sm,
  },
  modalMenuItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  modalItemLeft: {
    flex: 1,
    gap: 2,
  },
  modalItemRight: {
    alignItems: 'flex-end',
  },
  modalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  modalStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
  },
  modalStepBtn: {
    padding: 6,
  },
  modalStepQty: {
    minWidth: 22,
    textAlign: 'center',
    fontWeight: '700',
    color: colors.primary,
  },
  modalBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

