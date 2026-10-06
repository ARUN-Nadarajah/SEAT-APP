import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, ErrorState, Field, Skeleton, useFeedback } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  createManagerOffer,
  deleteManagerOffer,
  fetchManagerOffers,
  updateManagerOffer,
  type Offer,
  type OfferInput,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

type OfferType = 'Percentage' | 'Value';

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  return dateString(new Date());
}

function dateFromString(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function displayDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatValue(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0
    ? `Rs. ${amount}`
    : '';
}

function displayDiscount(offer: Offer) {
  const numericValue = offer.value.replace(/[^\d.]/g, '');
  return offer.type === 'Percentage' ? `${numericValue}%` : `Rs. ${numericValue}`;
}

const fallbackImage =
  'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80';

const offerImages = [
  'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
];

function shareableImageUri(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : fallbackImage;
}

function chooseOfferImage(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  const keywordIndex = ([
    ['dessert', 3],
    ['sweet', 3],
    ['coffee', 2],
    ['drink', 2],
    ['lunch', 0],
    ['dinner', 1],
    ['table', 1],
  ] as Array<[string, number]>).find(([keyword]) => text.includes(keyword))?.[1];

  if (keywordIndex !== undefined) return offerImages[keywordIndex];

  const score = [...text].reduce((total, character) => total + character.charCodeAt(0), 0);
  return offerImages[score % offerImages.length];
}

function OfferImage({
  uri,
  style,
}: {
  uri: string;
  style: object;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !shareableImageUri(uri)) {
    return (
      <View style={[style, styles.imagePlaceholder]}>
        <Ionicons name="image-outline" size={32} color={colors.primary} />
        <AppText variant="caption">Image unavailable</AppText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: shareableImageUri(uri) }}
      style={style}
      onError={() => setFailed(true)}
      accessibilityLabel="Offer image"
    />
  );
}

export default function OffersScreen() {
  const { showToast } = useFeedback();
  const { logout } = useAuth();
  const offersQuery = useApiQuery(['manager-offers'], fetchManagerOffers);
  const offers = useMemo(() => offersQuery.data?.data ?? [], [offersQuery.data]);
  const [showForm, setShowForm] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerToDelete, setOfferToDelete] = useState<Offer | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'Percentage' as OfferType,
    value: '',
    requiredReservations: '5',
    startDate: todayDateString(),
    endDate: todayDateString(),
    active: true,
    image: '',
  });
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);

  const saveMutation = useApiMutation(
    (input: { id?: string; offer: OfferInput }) =>
      input.id ? updateManagerOffer(input.id, input.offer) : createManagerOffer(input.offer),
    {
      invalidate: [['manager-offers']],
      onSuccess: () => {
        closeForm();
        showToast('Offer saved successfully.', 'success');
      },
      onError: (message) => {
        showToast(message, 'error');
        if (message === 'Your session has expired. Please sign in again.' ||
            message === 'Authentication required.') {
          void logout().finally(() => router.replace('/(auth)/login'));
        }
      },
    },
  );
  const deleteMutation = useApiMutation(deleteManagerOffer, {
    invalidate: [['manager-offers']],
    onSuccess: () => showToast('Offer deleted.', 'success'),
    onError: (message) => {
      showToast(message, 'error');
      if (message === 'Your session has expired. Please sign in again.' ||
          message === 'Authentication required.') {
        void logout().finally(() => router.replace('/(auth)/login'));
      }
    },
  });

  function openAddForm() {
    setEditingOfferId(null);
    setForm({
      title: '',
      description: '',
      type: 'Percentage',
      value: '',
      requiredReservations: '5',
      startDate: todayDateString(),
      endDate: todayDateString(),
      active: true,
      image: '',
    });
    setShowForm(true);
  }

  function openEditForm(offer: Offer) {
    setEditingOfferId(offer.id);
    setForm({
      title: offer.title,
      description: offer.description,
      type: offer.type,
      value: offer.type === 'Value'
        ? offer.value.replace(/[^\d.]/g, '')
        : offer.value.replace('%', ''),
      requiredReservations: String(offer.requiredReservations),
      startDate: offer.startDate,
      endDate: offer.endDate,
      active: offer.active,
      image: offer.image,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingOfferId(null);
    setDatePicker(null);
  }

  function handleDateChange(event: DateTimePickerEvent, selected?: Date) {
    const field = datePicker;
    setDatePicker(null);
    if (event.type === 'dismissed' || !selected || !field) return;
    const nextDate = dateString(selected);
    setForm((current) => ({
      ...current,
      [field === 'start' ? 'startDate' : 'endDate']: nextDate,
    }));
  }

  const activeCount = useMemo(
    () => offers.filter((offer) => offer.active).length,
    [offers],
  );

  async function handleSaveOffer() {
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      showToast('Offer title is required.', 'error');
      return;
    }
    const requiredReservations = Number(form.requiredReservations);
    if (!Number.isInteger(requiredReservations) || requiredReservations < 0) {
      showToast('Required reservations must be a whole number of 0 or more.', 'error');
      return;
    }
    const today = todayDateString();
    if (form.startDate < today) {
      showToast('Start date must be today or a future date.', 'error');
      return;
    }
    if (form.endDate < form.startDate) {
      showToast('End date must be on or after the start date.', 'error');
      return;
    }
    const numericDiscount = Number(form.value.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numericDiscount) || numericDiscount <= 0) {
      showToast('Enter a valid discount value.', 'error');
      return;
    }
    const discountValue = form.type === 'Value'
      ? formatValue(form.value)
      : `${numericDiscount}%`;

    const nextOffer: OfferInput = {
      title: trimmedTitle,
      description: form.description.trim() || 'Limited-time offer for your guests.',
      type: form.type,
      value: discountValue,
      requiredReservations,
      active: form.active,
      image:
        editingOfferId === null
          ? chooseOfferImage(trimmedTitle, form.description)
          : form.image || chooseOfferImage(trimmedTitle, form.description),
      startDate: form.startDate || '2026-10-19',
      endDate: form.endDate || '2026-10-31',
    };

    try {
      await saveMutation.mutateAsync({ id: editingOfferId ?? undefined, offer: nextOffer });
    } catch {
      // useApiMutation already reports the server message through the toast.
    }
  }

  function confirmDelete(offer: Offer) {
    setOfferToDelete(offer);
  }

  function closeDeleteDialog() {
    setOfferToDelete(null);
  }

  function handleDelete() {
    if (!offerToDelete) return;
    deleteMutation.mutate(String(offerToDelete.id), {
      onSettled: closeDeleteDialog,
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={19} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="heading" style={styles.title}>Offers & Promotions</AppText>
        <Pressable
          style={styles.addButton}
          onPress={openAddForm}
          accessibilityRole="button"
          accessibilityLabel="Add offer"
        >
          <Ionicons name="add" size={18} color={colors.textOnPrimary} />
          <AppText variant="label" style={styles.addButtonText}>Add Offer</AppText>
        </Pressable>
      </View>

      {offersQuery.isLoading ? <Skeleton /> : offersQuery.isError ? (
        <ErrorState message={apiErrorMessage(offersQuery.error)} onRetry={() => offersQuery.refetch()} />
      ) : <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <AppText variant="caption">{activeCount} active</AppText>
          <AppText variant="caption">{offers.length} total offers</AppText>
        </View>

        {offers.map((offer) => (
          <Card key={offer.id} style={styles.offerCard}>
            <OfferImage uri={offer.image} style={styles.offerImage} />

            <View style={styles.offerBody}>
              <View style={styles.rowBetween}>
                <View style={styles.statusBadge}>
                  <AppText variant="caption" style={styles.statusText}>
                    {offer.active ? 'Active' : 'Inactive'}
                  </AppText>
                </View>
                <View style={styles.offerActions}>
                  <Pressable
                    onPress={() => openEditForm(offer)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${offer.title}`}
                    style={styles.editButton}
                  >
                    <Ionicons name="pencil-outline" size={19} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(offer)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${offer.title}`}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={19} color={colors.danger} />
                  </Pressable>
                </View>
              </View>

              <AppText variant="heading" style={styles.offerTitle}>
                {offer.title}
              </AppText>

              <View style={styles.offerMetaWrap}>
                <AppText variant="label" style={styles.offerValue}>
                  {displayDiscount(offer)}
                </AppText>
                <AppText variant="secondary">{offer.description}</AppText>
              </View>

              <View style={styles.metaRow}>
                <AppText variant="caption">Required reservations: {offer.requiredReservations}</AppText>
                <AppText variant="caption">{offer.startDate} → {offer.endDate}</AppText>
              </View>

            </View>
          </Card>
        ))}
      </ScrollView>}

      {showForm ? (
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText variant="heading">
                {editingOfferId === null ? 'Add Offer' : 'Edit Offer'}
              </AppText>
              <Pressable
                onPress={closeForm}
                accessibilityRole="button"
                accessibilityLabel="Close add offer form"
                style={styles.closeButton}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
              <View style={styles.imageBox}>
                <OfferImage
                  uri={form.image || chooseOfferImage(form.title, form.description)}
                  style={styles.formImage}
                />
              </View>

              <AppText variant="caption" style={styles.imageHint}>
                A relevant food image will be selected automatically when you save this offer.
              </AppText>

              <Field
                label="Offer Title"
                value={form.title}
                onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
                placeholder="Local Customer Reward"
              />

              <Field
                label="Description"
                value={form.description}
                onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
                placeholder="Offer details and guest benefits"
                multiline
              />

              <AppText variant="label" style={styles.fieldLabel}>Discount Type</AppText>
              <View style={styles.segmentedRow}>
                {(['Percentage', 'Value'] as OfferType[]).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setForm((current) => ({ ...current, type }))}
                    style={[styles.segment, form.type === type && styles.segmentActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: form.type === type }}
                  >
                    <AppText
                      variant="label"
                      style={form.type === type ? styles.segmentTextActive : styles.segmentText}
                    >
                      {type}
                    </AppText>
                  </Pressable>
                ))}
              </View>

              <Field
                label={form.type === 'Percentage' ? 'Percentage' : 'Discount Value'}
                value={form.value}
                onChangeText={(value) =>
                setForm((current) => ({
                  ...current,
                  value: value.replace(/[^\d.]/g, ''),
                }))
                }
                placeholder={form.type === 'Percentage' ? '15' : '1000'}
                keyboardType="numeric"
                leftAccessory={
                  form.type === 'Value' ? (
                    <AppText variant="label" style={styles.inputPrefix}>Rs.</AppText>
                  ) : undefined
                }
                rightAccessory={
                  form.type === 'Percentage' ? (
                    <AppText variant="label" style={styles.inputSuffix}>%</AppText>
                  ) : undefined
                }
              />

              <Field
                label="Required Complimentary Reservations"
                value={form.requiredReservations}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, requiredReservations: value }))
                }
                placeholder="5"
                keyboardType="numeric"
              />

              <View style={styles.dateGrid}>
                <View style={styles.dateField}>
                  <AppText variant="label" style={styles.fieldLabel}>Start Date</AppText>
                  {Platform.OS === 'web' ? (
                    <View style={styles.webDateButton}>
                      <AppText variant="body">{displayDate(form.startDate)}</AppText>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                      <input
                        type="date"
                        value={form.startDate}
                        min={todayDateString()}
                        aria-label="Start Date"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, startDate: event.target.value }))
                        }
                        style={styles.webDateInput}
                      />
                    </View>
                  ) : (
                    <Pressable style={styles.dateButton} onPress={() => setDatePicker('start')}>
                      <AppText variant="body">{displayDate(form.startDate)}</AppText>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
                <View style={styles.dateField}>
                  <AppText variant="label" style={styles.fieldLabel}>End Date</AppText>
                  {Platform.OS === 'web' ? (
                    <View style={styles.webDateButton}>
                      <AppText variant="body">{displayDate(form.endDate)}</AppText>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                      <input
                        type="date"
                        value={form.endDate}
                        min={form.startDate || todayDateString()}
                        aria-label="End Date"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, endDate: event.target.value }))
                        }
                        style={styles.webDateInput}
                      />
                    </View>
                  ) : (
                    <Pressable style={styles.dateButton} onPress={() => setDatePicker('end')}>
                      <AppText variant="body">{displayDate(form.endDate)}</AppText>
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              </View>

              {datePicker && Platform.OS !== 'web' ? (
                <DateTimePicker
                  value={dateFromString(datePicker === 'start' ? form.startDate : form.endDate)}
                  mode="date"
                  minimumDate={
                    datePicker === 'end' ? dateFromString(form.startDate) : new Date()
                  }
                  onChange={handleDateChange}
                />
              ) : null}

              <View style={styles.toggleRow}>
                <AppText variant="label">Active</AppText>
                <Switch
                  value={form.active}
                  onValueChange={(value) => setForm((current) => ({ ...current, active: value }))}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>

              <View style={styles.formActions}>
                <Button label="Cancel" variant="secondary" onPress={closeForm} />
                <Button
                  label={editingOfferId === null ? 'Save Offer' : 'Update Offer'}
                  onPress={handleSaveOffer}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      ) : null}

      {offerToDelete ? (
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </View>
            <AppText variant="heading">Delete this offer?</AppText>
            <AppText variant="secondary" style={styles.confirmMessage}>
              “{offerToDelete.title}” will be permanently removed.
            </AppText>
            <View style={styles.confirmActions}>
              <Button label="Keep offer" variant="secondary" onPress={closeDeleteDialog} />
              <Button
                label={deleteMutation.isPending ? 'Deleting…' : 'Delete offer'}
                variant="danger"
                onPress={handleDelete}
                disabled={deleteMutation.isPending}
              />
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addButtonText: { color: colors.textOnPrimary },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'],
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  offerCard: {
    overflow: 'hidden',
    padding: 0,
  },
  offerImage: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  offerBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusText: { color: colors.primary },
  offerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  deleteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  offerTitle: { color: colors.primary },
  offerMetaWrap: { gap: spacing.xs },
  offerValue: {
    fontSize: 22,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 33, 27, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(20, 33, 27, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  confirmIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FBE9E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmMessage: { textAlign: 'center' },
  confirmActions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '82%',
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  imageBox: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  formImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  imageHint: { marginTop: -spacing.xs },
  imagePlaceholder: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  fieldLabel: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  inputSuffix: {
    color: colors.primary,
    minWidth: 28,
    textAlign: 'right',
  },
  inputPrefix: {
    color: colors.primary,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: { color: colors.textSecondary },
  segmentTextActive: { color: colors.textOnPrimary },
  dateGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateField: { flex: 1, gap: spacing.xs },
  dateButton: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webDateButton: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  webDateInput: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
