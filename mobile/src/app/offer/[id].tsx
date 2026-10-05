import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, ErrorState, Skeleton } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchEligibleOffers } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

function displayDiscount(type: string, value: string) {
  const numericValue = value.replace(/[^\d.]/g, '');
  return type === 'Percentage' ? `${numericValue}%` : `Rs. ${numericValue}`;
}

export default function OfferDetailsScreen() {
  const { id, restaurantId } = useLocalSearchParams<{
    id: string;
    restaurantId?: string;
  }>();
  const query = useApiQuery(
    ['customer-offer', id, restaurantId],
    () => fetchEligibleOffers(String(restaurantId)),
    { enabled: Boolean(id && restaurantId) },
  );
  const offer = query.data?.data?.find((entry) => String(entry.id) === String(id));

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loading}>
          <Skeleton height={240} radius={radius.lg} />
          <Skeleton height={32} width="70%" />
          <Skeleton height={24} width="35%" />
          <Skeleton height={100} radius={radius.md} />
        </View>
      </SafeAreaView>
    );
  }

  if (query.isError || !offer) {
    return (
      <SafeAreaView style={styles.root}>
        <Header />
        <ErrorState
          message={query.isError ? apiErrorMessage(query.error) : 'This offer is no longer available.'}
          onRetry={() => query.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: offer.image }} style={styles.hero} />
        <AppText variant="heading" style={styles.title}>{offer.title}</AppText>
        <AppText variant="display" style={styles.discount}>
          {displayDiscount(offer.type, offer.value)}
        </AppText>
        <AppText variant="body" style={styles.description}>{offer.description}</AppText>

        <View style={styles.infoCard}>
          <InfoRow icon="calendar-outline" label="Valid dates" value={`${offer.startDate} to ${offer.endDate}`} />
          <InfoRow
            icon="checkmark-circle-outline"
            label="Unlocked after"
            value={`${offer.requiredReservations} completed reservation${offer.requiredReservations === 1 ? '' : 's'}`}
          />
        </View>
        <AppText variant="caption" style={styles.note}>
          Show this offer when making your next reservation.
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Ionicons.Button
        name="chevron-back"
        size={22}
        color={colors.textPrimary}
        backgroundColor="transparent"
        underlayColor={colors.surfaceAlt}
        onPress={() => router.back()}
        accessibilityLabel="Go back"
      />
      <AppText variant="label">Offer details</AppText>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={styles.infoText}>
        <AppText variant="caption">{label}</AppText>
        <AppText variant="bodyMedium">{value}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerSpacer: { width: 44 },
  content: { padding: spacing.lg, gap: spacing.md },
  loading: { padding: spacing.lg, gap: spacing.md },
  hero: { width: '100%', height: 230, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  title: { color: colors.primary, marginTop: spacing.sm },
  discount: { color: colors.primary },
  description: { color: colors.textSecondary, lineHeight: 24 },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoText: { flex: 1, gap: spacing.xs },
  note: { color: colors.textMuted, textAlign: 'center' },
});
