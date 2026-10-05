import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
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
  RowSkeleton,
  Skeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/features/auth/auth-context';
import {
  apiErrorMessage,
  callNextParty,
  checkInBooking,
  createTable,
  fetchRestaurants,
  fetchStaffQueue,
  fetchStaffReservations,
  fetchTables,
  removeFromQueue,
  seatParty,
  updateTable,
  updateTableStatus,
  type Table,
  type TableStatus,
} from '@/services/api';
import { onTableUpdated, onQueueUpdated } from '@/services/realtime/socket';
import { colors, radius, spacing } from '@/theme';

type Panel = 'tables' | 'reservations' | 'queue';

const PANELS: { key: Panel; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'tables', label: 'Tables', icon: 'grid-outline' },
  { key: 'reservations', label: 'Bookings', icon: 'calendar-outline' },
  { key: 'queue', label: 'Queue', icon: 'people-outline' },
];

const TABLE_CYCLE: TableStatus[] = ['available', 'occupied', 'reserved'];
const CAPACITY_OPTIONS = ['2', '4', '6', '8'];
const TABLE_TYPE_OPTIONS = ['Standard', 'Window', 'Booth', 'Outdoor'] as const;
const TABLE_STATUS_OPTIONS = ['available', 'reserved', 'occupied'] as const;

/**
 * Staff Dashboard (spec §5 / FR08 / FR09).
 *
 * Three panels behind one segmented control: table grid, today's
 * reservations with search + check-in, and the live queue with call-next.
 */
export default function StaffDashboardScreen() {
  const { user, logout } = useAuth();
  const { showToast } = useFeedback();
  const [panel, setPanel] = useState<Panel>('tables');
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'all' | TableStatus>('all');
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [tableFormOpen, setTableFormOpen] = useState(false);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableForm, setTableForm] = useState({
    tableNumber: '',
    capacity: '2',
    type: 'Standard',
    location: '',
    status: 'available' as TableStatus,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmittingTable, setIsSubmittingTable] = useState(false);
  const [fieldPicker, setFieldPicker] = useState<'capacity' | 'type' | 'status' | null>(null);

  // Resolve the venue this staff member works at (spec §2).
  const venueQuery = useApiQuery(['staff-venue', user?.restaurantId], async () => {
    if (user?.restaurantId) {
      const all = await fetchRestaurants({ limit: 100 });
      return all.data?.find((r) => r.id === user.restaurantId) ?? all.data?.[0] ?? null;
    }
    const all = await fetchRestaurants({ limit: 100 });
    return all.data?.[0] ?? null;
  });

  const restaurantId = venueQuery.data?.id ?? user?.restaurantId ?? '';

  const tables = useApiQuery(
    ['tables', restaurantId],
    () => fetchTables(restaurantId),
    { enabled: Boolean(restaurantId) },
  );

  const reservations = useApiQuery(
    ['staff-reservations', restaurantId, search],
    () =>
      fetchStaffReservations({
        restaurantId,
        date: new Date().toISOString().slice(0, 10),
        q: search.trim() || undefined,
      }),
    { enabled: Boolean(restaurantId) },
  );

  const queue = useApiQuery(['staff-queue', restaurantId], () =>
    fetchStaffQueue(restaurantId),
  );

  const markLive = useCallback(() => setLiveAt(new Date().toISOString()), []);

  // FR05/FR08 — live floor updates while the dashboard is open.
  useEffect(() => {
    if (!restaurantId) return;
    const offTables = onTableUpdated(restaurantId, () => {
      tables.refetch();
      markLive();
    });
    const offQueue = onQueueUpdated(restaurantId, () => {
      queue.refetch();
      markLive();
    });
    return () => {
      offTables();
      offQueue();
    };
  }, [restaurantId, tables.refetch, queue.refetch, markLive]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([tables.refetch(), reservations.refetch(), queue.refetch()]);
    setRefreshing(false);
  }

  function resetTableForm(table?: Partial<Table>) {
    setTableForm({
      tableNumber: table?.tableNumber ?? '',
      capacity: String(table?.capacity ?? 2),
      type: table?.type ?? 'Standard',
      location: table?.location ?? '',
      status: table?.status ?? 'available',
    });
    setFormErrors({});
  }

  function openAddTableModal() {
    setEditingTableId(null);
    resetTableForm();
    setTableFormOpen(true);
  }

  function openEditTableModal(table: Table) {
    setEditingTableId(table.id);
    resetTableForm(table);
    setTableFormOpen(true);
  }

  function validateTableForm() {
    const nextErrors: Record<string, string> = {};

    if (!tableForm.tableNumber.trim()) {
      nextErrors.tableNumber = 'Table number is required.';
    } else {
      const normalizedNumber = tableForm.tableNumber.trim().toLowerCase();
      const duplicateTable = (tables.data?.data ?? []).some(
        (table) =>
          table.id !== editingTableId &&
          String(table.tableNumber).trim().toLowerCase() === normalizedNumber,
      );

      if (duplicateTable) {
        nextErrors.tableNumber = 'This table number already exists.';
      }
    }
    if (!tableForm.capacity) {
      nextErrors.capacity = 'Capacity is required.';
    }
    if (!tableForm.type.trim()) {
      nextErrors.type = 'Table type is required.';
    }
    if (!tableForm.status) {
      nextErrors.status = 'Availability status is required.';
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSelectField(value: string) {
    if (!fieldPicker) return;

    if (fieldPicker === 'capacity') {
      setTableForm((prev) => ({ ...prev, capacity: value }));
      if (formErrors.capacity) setFormErrors((prev) => ({ ...prev, capacity: '' }));
    }

    if (fieldPicker === 'type') {
      setTableForm((prev) => ({ ...prev, type: value }));
      if (formErrors.type) setFormErrors((prev) => ({ ...prev, type: '' }));
    }

    if (fieldPicker === 'status') {
      setTableForm((prev) => ({ ...prev, status: value as TableStatus }));
      if (formErrors.status) setFormErrors((prev) => ({ ...prev, status: '' }));
    }

    setFieldPicker(null);
  }

  function renderFieldOptions(field: 'capacity' | 'type' | 'status') {
    if (fieldPicker !== field) return null;

    const options =
      field === 'capacity'
        ? CAPACITY_OPTIONS
        : field === 'type'
          ? TABLE_TYPE_OPTIONS
          : TABLE_STATUS_OPTIONS;

    return (
      <View style={styles.inlineDropdown}>
        {options.map((option) => (
          <Pressable
            key={option}
            style={styles.inlineDropdownOption}
            onPress={() => handleSelectField(option)}
          >
            <AppText style={styles.dropdownOptionText}>
              {field === 'capacity'
                ? `${option} Guests`
                : field === 'type'
                  ? option
                  : option.charAt(0).toUpperCase() + option.slice(1)}
            </AppText>
          </Pressable>
        ))}
      </View>
    );
  }

  async function submitTableForm() {
    if (!validateTableForm()) return;

    setIsSubmittingTable(true);
    const payload = {
      tableNumber: tableForm.tableNumber.trim(),
      capacity: Number.parseInt(tableForm.capacity, 10) || 2,
      type: tableForm.type.trim() || 'Standard',
      location: tableForm.location.trim(),
      status: tableForm.status,
    };

    try {
      if (editingTableId) {
        await updateTable(editingTableId, payload);
        showToast('Table updated successfully.', 'success');
      } else {
        const result = await createTable({ restaurantId, ...payload, isActive: true });
        showToast(`Table ${result.data?.tableNumber ?? payload.tableNumber} added successfully.`, 'success');
      }
      tables.refetch();
      setTableFormOpen(false);
      setEditingTableId(null);
      resetTableForm();
    } catch (error) {
      const message = apiErrorMessage(error);
      if (message.toLowerCase().includes('already exists')) {
        setFormErrors((prev) => ({
          ...prev,
          tableNumber: 'This table number already exists.',
        }));
      }
      showToast(message, 'error');
    } finally {
      setIsSubmittingTable(false);
    }
  }

  async function toggleTable(id: string, current: TableStatus) {
    const next = TABLE_CYCLE[(TABLE_CYCLE.indexOf(current) + 1) % TABLE_CYCLE.length];
    try {
      await updateTableStatus(id, next);
      tables.refetch();
      markLive();
      showToast(`Table marked ${next}.`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onCheckIn(bookingId: string) {
    try {
      await checkInBooking(bookingId, restaurantId);
      reservations.refetch();
      showToast('Guest checked in.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onCallNext() {
    try {
      const result = await callNextParty(restaurantId);
      queue.refetch();
      tables.refetch();
      router.push({
        pathname: '/(staff)/notified',
        params: {
          queueCode: result.data?.queueCode ?? '',
          tableNumber: result.data?.tableNumber ?? '',
          guestName: result.data?.guestName ?? '',
          partySize: String(result.data?.partySize ?? ''),
        },
      });
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onSeat(entryId: string) {
    try {
      await seatParty(entryId, restaurantId);
      queue.refetch();
      tables.refetch();
      showToast('Party seated.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onRemove(entryId: string) {
    try {
      await removeFromQueue(entryId, restaurantId, 'no-show');
      queue.refetch();
      showToast('Removed from queue.', 'info');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  const summary = tables.data?.summary;
  const waitingCount = queue.data?.data?.filter((row) => row.status === 'waiting').length ?? 0;
  const filteredTables = (tables.data?.data ?? []).filter((table) => {
    const matchesFilter = tableFilter === 'all' || table.status === tableFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      table.tableNumber.toLowerCase().includes(query) ||
      table.location.toLowerCase().includes(query) ||
      String(table.capacity).includes(query) ||
      (table.type ?? 'Standard').toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="caption">STAFF DASHBOARD</AppText>
          <AppText variant="title" numberOfLines={1}>
            {venueQuery.data?.name ?? 'Loading venue…'}
          </AppText>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.logoutButton}
            onPress={async () => {
              await logout();
              router.replace('/(auth)/login');
            }}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          </Pressable>
          {panel === 'tables' ? (
            <Pressable
              style={styles.addButton}
              onPress={openAddTableModal}
              accessibilityRole="button"
              accessibilityLabel="Add new table"
            >
              <Ionicons name="add-outline" size={18} color={colors.textOnPrimary} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.bell}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Floor summary */}
      <View style={styles.statRow}>
        <Stat label="Free" value={summary?.available ?? 0} tone="success" />
        <Stat label="Seated" value={summary?.occupied ?? 0} tone="neutral" />
        <Stat label="Held" value={summary?.reserved ?? 0} tone="warning" />
        <Stat label="Waiting" value={waitingCount} tone="accent" />
      </View>

      {/* Panel switcher */}
      <View style={styles.panels}>
        {PANELS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setPanel(item.key)}
            style={[styles.panel, panel === item.key && styles.panelActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: panel === item.key }}
          >
            <Ionicons
              name={item.icon}
              size={16}
              color={panel === item.key ? colors.textOnPrimary : colors.textSecondary}
            />
            <AppText
              variant="label"
              style={panel === item.key ? styles.panelTextActive : styles.panelText}
            >
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <LastUpdated
          timestamp={liveAt ?? tables.data?.lastUpdated}
          live
          label={liveAt ? 'Live · updated just now' : undefined}
        />

        {/* --- FR08: table status grid --- */}
        {panel === 'tables' ? (
          tables.isLoading ? (
            <View style={styles.grid}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} height={86} radius={radius.md} />
              ))}
            </View>
          ) : tables.isError ? (
            <ErrorState message={apiErrorMessage(tables.error)} onRetry={() => tables.refetch()} />
          ) : (
            <>
              <View style={styles.searchShell}>
                <Ionicons name="search" size={17} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search table number..."
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Search tables"
                />
              </View>

              <View style={styles.filterRow}>
                {(['all', 'available', 'reserved', 'occupied'] as const).map((filter) => (
                  <Pressable
                    key={filter}
                    onPress={() => setTableFilter(filter)}
                    style={[
                      styles.filterChip,
                      filter === 'available' && styles.filterChipAvailable,
                      filter === 'reserved' && styles.filterChipReserved,
                      filter === 'occupied' && styles.filterChipOccupied,
                      tableFilter === filter && styles.filterChipActive,
                    ]}
                    accessibilityRole="button"
                  >
                    <AppText
                      variant="label"
                      style={[
                        styles.filterChipText,
                        filter === 'available' && styles.filterChipTextAvailable,
                        filter === 'reserved' && styles.filterChipTextReserved,
                        filter === 'occupied' && styles.filterChipTextOccupied,
                        tableFilter === filter && styles.filterChipTextActive,
                      ]}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <Button
                label="+ Add Table"
                onPress={openAddTableModal}
                accessibilityLabel="Add table"
              />

              {(filteredTables.length ?? 0) === 0 ? (
                <EmptyState title="No tables found" message="Try another search or add a new table." glyph="🪑" />
              ) : (
                <View style={styles.grid}>
                  {filteredTables.map((table, index) => (
                    <View
                      key={table.id ?? table._id ?? `table-${table.tableNumber}-${index}`}
                      style={styles.tableCardWrap}
                    >
                      <Pressable
                        onPress={() => toggleTable(table.id ?? String(table._id ?? table.tableNumber), table.status)}
                        style={[
                          styles.tableCell,
                          table.status === 'occupied' && styles.tableOccupied,
                          table.status === 'reserved' && styles.tableReserved,
                          table.status === 'maintenance' && styles.tableMaintenance,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Table ${table.tableNumber}, ${table.status}. Double tap to change.`}
                      >
                        <View
                          style={[
                            styles.tableStatusBadge,
                            table.status === 'occupied' && styles.tableStatusBadgeOccupied,
                            table.status === 'reserved' && styles.tableStatusBadgeReserved,
                          ]}
                        >
                          <AppText
                            variant="caption"
                            style={[
                              styles.tableStatusBadgeText,
                              table.status !== 'available' && styles.tableStatusBadgeTextInverse,
                            ]}
                          >
                            {table.status.charAt(0).toUpperCase() + table.status.slice(1)}
                          </AppText>
                        </View>
                        <AppText
                          variant="heading"
                          style={
                            table.status === 'available' ? undefined : styles.tableCellTextInverse
                          }
                        >
                          {table.tableNumber}
                        </AppText>
                        <AppText
                          variant="caption"
                          style={
                            table.status === 'available' ? undefined : styles.tableCellTextInverse
                          }
                        >
                          {table.capacity} seats
                        </AppText>
                        <AppText
                          variant="caption"
                          style={
                            table.status === 'available' ? undefined : styles.tableCellTextInverse
                          }
                        >
                          {table.type ?? 'Standard'}
                        </AppText>
                      </Pressable>

                      <Pressable
                        onPress={() => openEditTableModal(table)}
                        style={styles.editTableButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit table ${table.tableNumber}`}
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={18}
                          color={colors.primary}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )
        ) : null}

        {/* --- FR09: today's reservations with search + check-in --- */}
        {panel === 'reservations' ? (
          <>
            <View style={styles.searchShell}>
              <Ionicons name="search" size={17} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, booking ID or table"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Search reservations"
              />
            </View>

            {reservations.isLoading ? (
              <RowSkeleton count={3} />
            ) : reservations.isError ? (
              <ErrorState
                message={apiErrorMessage(reservations.error)}
                onRetry={() => reservations.refetch()}
              />
            ) : (reservations.data?.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No bookings today"
                message={search ? 'Nothing matches that search.' : 'A quiet day — enjoy it.'}
                glyph="🗓"
              />
            ) : (
              <View style={styles.list}>
                {(reservations.data?.data ?? []).map((booking) => (
                  <Card key={booking.id} style={styles.bookingCard}>
                    <View style={styles.bookingTop}>
                      <View style={styles.bookingTitleBlock}>
                        <AppText variant="bodyMedium">
                          {booking.guest?.name || booking.guestName || 'Guest'}
                        </AppText>
                        <AppText variant="caption">
                          {booking.time} · {booking.partySize} guests ·{' '}
                          {booking.tableNumber ? `Table ${booking.tableNumber}` : 'unassigned'} ·{' '}
                          {booking.bookingId}
                        </AppText>
                      </View>
                      <Badge
                        label={booking.status}
                        tone={booking.status === 'checked-in' ? 'success' : 'neutral'}
                      />
                    </View>

                    {booking.status === 'confirmed' ? (
                      <Button
                        label="Check in"
                        onPress={() => onCheckIn(booking.id)}
                        accessibilityLabel={`Check in ${booking.bookingId}`}
                      />
                    ) : null}
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}

        {/* --- FR09/Fr06: queue management --- */}
        {panel === 'queue' ? (
          queue.isLoading ? (
            <RowSkeleton count={3} />
          ) : queue.isError ? (
            <ErrorState message={apiErrorMessage(queue.error)} onRetry={() => queue.refetch()} />
          ) : (queue.data?.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nobody waiting"
              message="The queue is empty. Call next as soon as a party joins."
              glyph="⏳"
            />
          ) : (
            <>
              <Button
                label={`Call next party${waitingCount ? ` (${waitingCount})` : ''}`}
                onPress={onCallNext}
                disabled={waitingCount === 0}
                testID="call-next"
              />

              <View style={styles.list}>
                {(queue.data?.data ?? []).map((row) => (
                  <Card key={row.id} style={styles.queueCard}>
                    <View style={styles.bookingTop}>
                      <View style={styles.bookingTitleBlock}>
                        <AppText variant="bodyMedium">
                          {row.position}. {row.guestName}
                        </AppText>
                        <AppText variant="caption">
                          {row.queueCode} · party of {row.partySize} · {row.estimateLabel}
                        </AppText>
                      </View>
                      <Badge
                        label={row.status}
                        tone={
                          row.status === 'notified'
                            ? 'success'
                            : row.status === 'seated'
                              ? 'accent'
                              : 'neutral'
                        }
                      />
                    </View>

                    <View style={styles.queueActions}>
                      {row.status === 'waiting' || row.status === 'notified' ? (
                        <Button
                          label="Seat"
                          variant="secondary"
                          onPress={() => onSeat(row.id)}
                          style={styles.queueAction}
                        />
                      ) : null}
                      {row.status !== 'seated' ? (
                        <Button
                          label="Remove"
                          variant="danger"
                          onPress={() => onRemove(row.id)}
                          style={styles.queueAction}
                        />
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            </>
          )
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Switch account"
          variant="ghost"
          onPress={() => router.push('/(auth)/login')}
        />
      </View>

      <Modal
        visible={tableFormOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setTableFormOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText variant="title">
                {editingTableId ? 'Edit Table' : 'Add New Table'}
              </AppText>
              <Pressable onPress={() => setTableFormOpen(false)} accessibilityRole="button">
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.fieldWrap}>
              <AppText variant="label" style={styles.requiredLabel}>
                Table No <AppText style={styles.requiredStar}>*</AppText>
              </AppText>
              <TextInput
                style={[styles.input, formErrors.tableNumber ? styles.inputError : null]}
                value={tableForm.tableNumber}
                onChangeText={(value) => {
                  setTableForm((prev) => ({ ...prev, tableNumber: value }));
                  if (formErrors.tableNumber) setFormErrors((prev) => ({ ...prev, tableNumber: '' }));
                }}
                placeholder="e.g. Table 04"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Table number"
                autoCapitalize="none"
              />
              {formErrors.tableNumber ? <AppText style={styles.errorText}>{formErrors.tableNumber}</AppText> : null}
            </View>

            <View style={styles.fieldWrap}>
              <AppText variant="label" style={styles.requiredLabel}>
                Capacity <AppText style={styles.requiredStar}>*</AppText>
              </AppText>
              <Pressable
                style={[styles.selectInput, formErrors.capacity ? styles.inputError : null]}
                onPress={() => setFieldPicker('capacity')}
                accessibilityRole="button"
                accessibilityLabel="Select table capacity"
              >
                <AppText style={styles.selectText}>{tableForm.capacity} Guests</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
              </Pressable>
              {renderFieldOptions('capacity')}
              {formErrors.capacity ? <AppText style={styles.errorText}>{formErrors.capacity}</AppText> : null}
            </View>

            <View style={styles.fieldWrap}>
              <AppText variant="label" style={styles.requiredLabel}>
                Table Type <AppText style={styles.requiredStar}>*</AppText>
              </AppText>
              <Pressable
                style={[styles.selectInput, formErrors.type ? styles.inputError : null]}
                onPress={() => setFieldPicker('type')}
                accessibilityRole="button"
                accessibilityLabel="Select table type"
              >
                <AppText style={styles.selectText}>{tableForm.type}</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
              </Pressable>
              {renderFieldOptions('type')}
              {formErrors.type ? <AppText style={styles.errorText}>{formErrors.type}</AppText> : null}
            </View>

            <View style={styles.fieldWrap}>
              <AppText variant="label">Location</AppText>
              <TextInput
                style={styles.input}
                value={tableForm.location}
                onChangeText={(value) => setTableForm((prev) => ({ ...prev, location: value }))}
                placeholder="e.g. Ground Floor – Window Side"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Location"
              />
            </View>

            <View style={styles.fieldWrap}>
              <AppText variant="label" style={styles.requiredLabel}>
                Initial Availability Status <AppText style={styles.requiredStar}>*</AppText>
              </AppText>
              <Pressable
                style={[styles.selectInput, formErrors.status ? styles.inputError : null]}
                onPress={() => setFieldPicker('status')}
                accessibilityRole="button"
                accessibilityLabel="Select availability status"
              >
                <AppText style={styles.selectText}>{tableForm.status.charAt(0).toUpperCase() + tableForm.status.slice(1)}</AppText>
                <Ionicons name="chevron-down" size={18} color={colors.textPrimary} />
              </Pressable>
              {renderFieldOptions('status')}
              {formErrors.status ? <AppText style={styles.errorText}>{formErrors.status}</AppText> : null}
            </View>

            <Button
              label={editingTableId ? 'Update Table' : 'Add Table'}
              onPress={submitTableForm}
              loading={isSubmittingTable}
              disabled={isSubmittingTable}
              style={styles.submitButton}
            />

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'neutral' | 'warning' | 'accent';
}) {
  return (
    <View style={[styles.stat, statTones[tone]]}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: { flex: 1, gap: 2 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDEBEC',
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: 2,
  },
  panels: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  panel: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  panelText: { color: colors.textSecondary },
  panelTextActive: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'], gap: spacing.lg },
  footer: { padding: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tableCardWrap: {
    width: '31%',
    position: 'relative',
  },
  tableCell: {
    minWidth: 100,
    minHeight: 86,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.infoBox,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: spacing.sm,
    paddingTop: spacing.lg,
  },
  tableOccupied: { backgroundColor: colors.primary, borderColor: colors.primary },
  tableReserved: { backgroundColor: colors.warning, borderColor: colors.warning },
  tableMaintenance: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  tableCellTextInverse: { color: colors.textOnPrimary },
  tableStatusBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#E3F1E2',
    borderWidth: 1,
    borderColor: '#C6DEC4',
    zIndex: 1,
  },
  tableStatusBadgeOccupied: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.7)',
  },
  tableStatusBadgeReserved: { backgroundColor: '#FFF1D6', borderColor: '#E8C987' },
  tableStatusBadgeText: {
    color: colors.success,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    lineHeight: 11,
    textTransform: 'uppercase',
  },
  tableStatusBadgeTextInverse: { color: colors.primary },
  editTableButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(14, 20, 24, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  fieldWrap: { gap: 6 },
  requiredLabel: { color: colors.textPrimary },
  requiredStar: { color: colors.danger },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.danger },
  selectInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  inlineDropdown: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  inlineDropdownOption: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    marginBottom: 4,
  },
  dropdownOptionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.danger,
    marginTop: 2,
  },
  submitButton: { marginTop: spacing.sm },
  tableSummaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardAccent: {
    backgroundColor: colors.infoBox,
    borderColor: colors.success,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: { color: colors.textSecondary },
  filterChipTextActive: { color: colors.textOnPrimary },
  filterChipAvailable: { borderColor: colors.success, backgroundColor: '#EEF6E9' },
  filterChipReserved: { borderColor: colors.warning, backgroundColor: '#FFF4DE' },
  filterChipOccupied: { borderColor: colors.primary, backgroundColor: '#E5F0EB' },
  filterChipMaintenance: { borderColor: colors.textMuted, backgroundColor: '#EEF0EF' },
  filterChipTextAvailable: { color: colors.success },
  filterChipTextReserved: { color: colors.warning },
  filterChipTextOccupied: { color: colors.primary },
  filterChipTextMaintenance: { color: colors.textMuted },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  list: { gap: spacing.md },
  bookingCard: { gap: spacing.sm },
  bookingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bookingTitleBlock: { flex: 1, gap: 2 },
  queueCard: { gap: spacing.sm },
  queueActions: { flexDirection: 'row', gap: spacing.sm },
  queueAction: { flex: 1 },
});

const statTones = StyleSheet.create({
  success: { backgroundColor: colors.infoBox },
  neutral: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  warning: { backgroundColor: colors.warningBox },
  accent: { backgroundColor: colors.accent },
});
