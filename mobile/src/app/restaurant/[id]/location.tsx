import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, Badge, Button, Card, ErrorState, Skeleton } from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchRestaurant } from '@/services/api';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';
import { colors, radius, spacing } from '@/theme';

/**
 * Plan your arrival (spec §5): map, address and directions hint.
 *
 * `react-native-maps` is native-only — on web we fall back to a styled
 * placeholder so the route still renders.
 */
let MapView: any = null;
let Marker: any = null;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    MapView = maps.default ?? maps.MapView;
    Marker = maps.Marker;
  } catch {
    MapView = null;
  }
}

export default function LocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = id || EXPLORE_RESTAURANT_ID;

  const query = useApiQuery(
    ['restaurant', restaurantId],
    () => fetchRestaurant(restaurantId, { partySize: 2 }),
    { enabled: Boolean(restaurantId) },
  );

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Skeleton height={40} width="50%" />
          <Skeleton height={240} radius={radius.lg} />
          <Skeleton height={90} radius={radius.lg} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (query.isError || !query.data?.data) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Header />
        <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const restaurant = query.data.data;
  const coordinates = restaurant.location &&
    Number.isFinite(restaurant.location.lat) &&
    Number.isFinite(restaurant.location.lng)
    ? restaurant.location
    : { lat: 9.6615, lng: 80.0249 };
  const { lat, lng } = coordinates;
  const label = encodeURIComponent(restaurant.name);
  const directionsUrl = Platform.select({
    ios: `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`,
    android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <AppText variant="title">Plan your arrival</AppText>
          <AppText variant="secondary">{restaurant.name}</AppText>
        </View>

        <View style={styles.mapShell}>
          {MapView ? (
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: lat,
                longitude: lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }}
              accessibilityLabel={`Map showing ${restaurant.name}`}
            >
              <Marker
                coordinate={{ latitude: lat, longitude: lng }}
                title={restaurant.name}
                description={restaurant.address}
              />
            </MapView>
          ) : (
            <View style={[styles.map, styles.mapFallback]}>
              <Ionicons name="map" size={34} color={colors.primary} />
              <AppText variant="secondary" style={styles.mapFallbackText}>
                Map preview is available on a device or emulator.
              </AppText>
            </View>
          )}
        </View>

        <Card style={styles.addressCard}>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <AppText variant="bodyMedium" style={styles.addressText}>
              {restaurant.address}
            </AppText>
          </View>
          <View style={styles.badges}>
            <Badge label={restaurant.openHoursLabel} />
            <Badge label={restaurant.parkingLabel} tone={restaurant.parking ? 'success' : 'neutral'} />
          </View>
        </Card>

        <Card>
          <AppText variant="heading">Before you set off</AppText>
          <Tip text={`Allow ${Math.max(5, Math.round(restaurant.distanceMeters / 80))} minutes to walk from the town centre.`} />
          <Tip
            text={
              restaurant.parking
                ? 'Free parking is available beside the entrance.'
                : 'No on-street parking — arrive a little early.'
            }
          />
          <Tip text={`Tables are held for ${restaurant.averageSeatingMinutes} minutes after your slot begins.`} />
          <Tip text="Running late? Change or cancel from Bookings — it takes two taps." />
        </Card>

        <Button
          label="Open directions"
          onPress={() => Linking.openURL(directionsUrl!).catch(() => undefined)}
          accessibilityLabel="Open directions in your maps app"
        />
        <Button label="Back to restaurant" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      <AppText variant="secondary" style={styles.tipText}>
        {text}
      </AppText>
    </View>
  );
}

function Header() {
  return (
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
      <AppText variant="label">Location</AppText>
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
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  titleBlock: { gap: 2 },
  mapShell: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  map: { width: '100%', height: 240, backgroundColor: colors.skeleton },
  mapFallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mapFallbackText: { textAlign: 'center', paddingHorizontal: spacing.xl },
  addressCard: { gap: spacing.md },
  addressRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  addressText: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tip: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  tipText: { flex: 1 },
});
