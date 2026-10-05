import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Button, Card, ErrorState, Field, Skeleton, useFeedback } from '@/components/ui';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchManagedRestaurant,
  updateManagedRestaurant,
  type RestaurantInfo,
  type UpdateRestaurantInput,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

type FormState = UpdateRestaurantInput;
type Picker = 'cuisine' | 'parking' | null;
type TimeField = 'openingTime' | 'closingTime' | null;
const CUISINES = ['Sri Lankan / Asian', 'Sri Lankan', 'Jaffna Tamil', 'Indian', 'Chinese', 'Seafood'];
const PARKING = ['Available', 'Unavailable'];

function displayTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes || 0).padStart(2, '0')} ${suffix}`;
}

function to24h(value: string) {
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  if (match[3] === 'PM' && hours !== 12) hours += 12;
  if (match[3] === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || Number(match[2]) > 59) return null;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function validatePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 'Contact number is required.';
  if (digits.length < 10 || digits.length > 15) {
    return 'Enter a valid phone number with 10 to 15 digits.';
  }
  return '';
}

function formFromRestaurant(restaurant: RestaurantInfo): FormState {
  return {
    name: restaurant.name,
    description: restaurant.description,
    phone: restaurant.phone,
    address: restaurant.address,
    openingTime: displayTime(restaurant.openingTime),
    closingTime: displayTime(restaurant.closingTime),
    cuisine: restaurant.cuisine,
    parkingLabel: restaurant.parkingLabel,
    images: restaurant.images ?? [],
  };
}

export default function EditRestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showToast } = useFeedback();
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Picker>(null);
  const [timeField, setTimeField] = useState<TimeField>(null);
  const query = useApiQuery(
    ['managed-restaurant', id],
    () => fetchManagedRestaurant(id!),
    { enabled: Boolean(id) },
  );

  const loadedForm = query.data?.data ? formFromRestaurant(query.data.data) : null;
  const values = form ?? loadedForm;

  const mutation = useApiMutation(
    (input: UpdateRestaurantInput) => updateManagedRestaurant(id!, input),
    {
      invalidate: [['managed-restaurant', id], ['manager-venue']],
      onSuccess: () => {
        showToast('Restaurant information updated successfully.', 'success');
        router.replace({
          pathname: '/(manager)/restaurant-info',
          params: { id },
        });
      },
    },
  );

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...(current ?? loadedForm!), [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  }

  function validate() {
    if (!values) return false;
    const next: Record<string, string> = {};
    const requiredFields: Exclude<keyof FormState, 'images'>[] = [
      'name',
      'description',
      'phone',
      'address',
      'openingTime',
      'closingTime',
    ];
    for (const field of requiredFields) {
      if (!values[field].trim()) next[field] = 'This field is required.';
    }
    if (values.openingTime && !to24h(values.openingTime)) next.openingTime = 'Use a valid time, e.g. 10:00 AM.';
    if (values.closingTime && !to24h(values.closingTime)) next.closingTime = 'Use a valid time, e.g. 10:00 PM.';
    const phoneError = validatePhone(values.phone);
    if (phoneError) next.phone = phoneError;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function updatePhone(value: string) {
    const cleaned = value.replace(/[^\d+()\s-]/g, '');
    updateField('phone', cleaned);
    setErrors((current) => ({ ...current, phone: validatePhone(cleaned) }));
  }

  function save() {
    if (!values || !validate()) return;
    mutation.mutate({
      ...values,
      openingTime: to24h(values.openingTime) || values.openingTime,
      closingTime: to24h(values.closingTime) || values.closingTime,
      images: values.images,
    });
  }

  if (query.isLoading || !values) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.content}><Skeleton height={420} radius={radius.lg} /></View>
      </SafeAreaView>
    );
  }

  if (query.isError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.imageCard}>
          {values.images[0] ? (
            <Image source={{ uri: values.images[0] }} style={styles.coverPreview} />
          ) : (
            <View style={[styles.coverPreview, styles.coverFallback]}>
              <Ionicons name="restaurant-outline" size={34} color={colors.primary} />
            </View>
          )}
          <Field
            label="Cover Image URL"
            value={values.images[0] ?? ''}
            onChangeText={(value) => updateField('images', value ? [value] : [])}
            placeholder="https://..."
            keyboardType="url"
            autoCapitalize="none"
            hint="Paste a publicly accessible image URL to change the cover image."
          />
        </Card>
        <Card style={styles.formCard}>
          <Field label="Restaurant Name *" value={values.name} onChangeText={(v) => updateField('name', v)} error={errors.name} />
          <Field label="Description *" value={values.description} onChangeText={(v) => updateField('description', v)} error={errors.description} multiline />
          <Field label="Contact Number *" value={values.phone} onChangeText={updatePhone} error={errors.phone} keyboardType="phone-pad" hint="Use 10 to 15 digits, including country code if needed." />
          <Field label="Address *" value={values.address} onChangeText={(v) => updateField('address', v)} error={errors.address} />
          <View style={styles.timeRow}>
            <TimeFieldInput label="Opening Time *" value={values.openingTime} error={errors.openingTime} onPress={() => setTimeField('openingTime')} />
            <TimeFieldInput label="Closing Time *" value={values.closingTime} error={errors.closingTime} onPress={() => setTimeField('closingTime')} />
          </View>
          <SelectField label="Cuisine Type" value={values.cuisine} onPress={() => setPicker('cuisine')} />
          <SelectField label="Parking Availability" value={values.parkingLabel} onPress={() => setPicker('parking')} />
        </Card>
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} style={styles.action} />
          <Button label="Save Changes" onPress={save} loading={mutation.isPending} style={styles.action} />
        </View>
        {mutation.isError ? <AppText style={styles.submitError}>{apiErrorMessage(mutation.error)}</AppText> : null}
      </ScrollView>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPicker(null)}>
          <View style={styles.modalCard}>
            <AppText variant="heading">{picker === 'cuisine' ? 'Cuisine Type' : 'Parking Availability'}</AppText>
            {(picker === 'cuisine' ? CUISINES : PARKING).map((option) => (
              <Pressable
                key={option}
                style={styles.option}
                onPress={() => {
                  updateField(picker === 'cuisine' ? 'cuisine' : 'parkingLabel', option);
                  setPicker(null);
                }}
              >
                <AppText variant="body">{option}</AppText>
                {((picker === 'cuisine' && values.cuisine === option) || (picker === 'parking' && values.parkingLabel === option)) ? (
                  <Ionicons name="checkmark" size={18} color={colors.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <TimePicker
        visible={timeField !== null}
        value={timeField ? values[timeField] : ''}
        onClose={() => setTimeField(null)}
        onSelect={(value) => {
          if (timeField) updateField(timeField, value);
          setTimeField(null);
        }}
      />
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="heading" style={styles.headerTitle}>Edit Restaurant Information</AppText>
      <View style={styles.headerPlaceholder} />
    </View>
  );
}

function SelectField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.selectWrapper}>
      <AppText variant="label">{label}</AppText>
      <Pressable style={styles.select} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <AppText variant="body">{value}</AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function TimeFieldInput({
  label,
  value,
  error,
  onPress,
}: {
  label: string;
  value: string;
  error?: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.timeInputWrapper}>
      <AppText variant="label">{label}</AppText>
      <Pressable style={[styles.select, error && styles.inputError]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <AppText variant="body">{value}</AppText>
        <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
      </Pressable>
      {error ? <AppText variant="caption" style={styles.errorText}>{error}</AppText> : null}
    </View>
  );
}

function TimePicker({
  visible,
  value,
  onClose,
  onSelect,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const [hour, setHour] = useState('10');
  const [minute, setMinute] = useState('00');
  const [period, setPeriod] = useState('AM');

  function open() {
    const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      setHour(match[1]);
      setMinute(match[2]);
      setPeriod(match[3].toUpperCase());
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onShow={open} onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.timeModalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.timeModalHeader}>
            <AppText variant="heading">Choose time</AppText>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close time picker">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <AppText variant="secondary">Select the hour, minutes and period.</AppText>
          <View style={styles.timeOptions}>
            <TimeOptionList values={Array.from({ length: 12 }, (_, index) => String(index + 1))} selected={hour} onSelect={setHour} />
            <TimeOptionList values={['00', '15', '30', '45']} selected={minute} onSelect={setMinute} />
            <TimeOptionList values={['AM', 'PM']} selected={period} onSelect={setPeriod} />
          </View>
          <Button label="Use this time" onPress={() => onSelect(`${hour}:${minute} ${period}`)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TimeOptionList({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.timeOptionColumn}>
      {values.map((option) => (
        <Pressable key={option} style={[styles.timeOption, selected === option && styles.timeOptionActive]} onPress={() => onSelect(option)}>
          <AppText variant="label" style={selected === option ? styles.timeOptionTextActive : undefined}>{option}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerPlaceholder: { width: 44 },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  imageCard: { gap: spacing.md },
  coverPreview: { width: '100%', height: 170, borderRadius: radius.lg },
  coverFallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  formCard: { gap: spacing.lg },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1 },
  selectWrapper: { gap: spacing.xs },
  select: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger },
  timeInputWrapper: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  submitError: { color: colors.danger, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.sm },
  timeModalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  timeModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeOptions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  timeOptionColumn: { flex: 1, gap: spacing.xs },
  timeOption: { minHeight: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  timeOptionActive: { backgroundColor: colors.primary },
  timeOptionTextActive: { color: colors.textOnPrimary },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
});
