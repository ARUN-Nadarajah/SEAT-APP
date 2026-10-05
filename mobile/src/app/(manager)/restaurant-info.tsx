import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Card,
  ErrorState,
  LastUpdated,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchManagedRestaurant } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

function displayTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes || 0).padStart(2, '0')} ${suffix}`;
}

export default function RestaurantInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useApiQuery(
    ['managed-restaurant', id],
    () => fetchManagedRestaurant(id!),
    { enabled: Boolean(id) },
  );

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <View style={styles.content}>
          <Skeleton height={190} radius={radius.lg} />
          <Skeleton height={250} radius={radius.lg} />
        </View>
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header onBack={() => router.back()} />
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const restaurant = query.data.data;
  const image = restaurant.images?.[0];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header
        onBack={() => router.back()}
        action={
          <Pressable
            style={styles.editButton}
            onPress={() =>
              router.push({
                pathname: '/(manager)/edit-restaurant',
                params: { id: restaurant._id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel="Edit restaurant information"
          >
            <Ionicons name="pencil" size={15} color={colors.textOnPrimary} />
            <AppText variant="label" style={styles.editButtonText}>Edit</AppText>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {image ? (
          <Image source={{ uri: image }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroFallback]}>
            <Ionicons name="restaurant-outline" size={42} color={colors.primary} />
          </View>
        )}

        <Card style={styles.infoCard}>
          <InfoRow icon="person-outline" label="Restaurant Name" value={restaurant.name} />
          <InfoRow icon="document-text-outline" label="Description" value={restaurant.description} />
          <InfoRow icon="call-outline" label="Contact Number" value={restaurant.phone} />
          <InfoRow icon="location-outline" label="Address" value={restaurant.address} />
          <InfoRow
            icon="time-outline"
            label="Opening Hours"
            value={`${displayTime(restaurant.openingTime)} – ${displayTime(restaurant.closingTime)}`}
          />
          <InfoRow icon="restaurant-outline" label="Cuisine Type" value={restaurant.cuisine} />
          <InfoRow
            icon="car-outline"
            label="Parking Availability"
            value={restaurant.parkingLabel}
            last
          />
        </Card>
        <LastUpdated timestamp={query.data.lastUpdated} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({
  onBack,
  action,
}: {
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
      </Pressable>
      <AppText variant="heading" style={styles.headerTitle}>Restaurant Information</AppText>
      {action ?? <View style={styles.headerActionPlaceholder} />}
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={19} color={colors.primary} />
      <AppText variant="label" style={styles.infoLabel}>{label}</AppText>
      <AppText variant="secondary" style={styles.infoValue}>{value || '—'}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerActionPlaceholder: { width: 66 },
  editButton: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editButtonText: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  hero: { width: '100%', height: 190, borderRadius: radius.lg },
  heroFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: { paddingVertical: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { width: 112 },
  infoValue: { flex: 1 },
});
