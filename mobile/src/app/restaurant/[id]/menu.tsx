import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchMenu } from '@/services/api';
import { colors, radius, spacing } from '@/theme';

function formatPrice(price: number): string {
  return `LKR ${price.toLocaleString()}`;
}

/** "A taste of …" menu screen (spec §5). */
export default function MenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useApiQuery(['menu', id], () => fetchMenu(id!), {
    enabled: Boolean(id),
  });

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
        <AppText variant="label">Menu</AppText>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleBlock}>
          <AppText variant="title">
            A taste of {query.data?.data?.restaurant.name ?? 'the kitchen'}
          </AppText>
          <AppText variant="secondary">
            Prices in Sri Lankan rupees. Ask your server about allergens.
          </AppText>
        </View>

        {query.isLoading ? (
          <View style={styles.list}>
            <Skeleton height={22} width="40%" />
            <Skeleton height={70} radius={radius.lg} />
            <Skeleton height={70} radius={radius.lg} />
            <Skeleton height={22} width="35%" />
            <Skeleton height={70} radius={radius.lg} />
          </View>
        ) : query.isError ? (
          <ErrorState
            message={apiErrorMessage(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : (query.data?.data?.categories.length ?? 0) === 0 ? (
          <EmptyState
            title="Menu coming soon"
            message="This restaurant hasn’t uploaded its dishes yet."
            glyph="🍽"
          />
        ) : (
          <View style={styles.list}>
            {query.data?.data?.categories.map((category) => (
              <Card key={category.name} style={styles.category}>
                <AppText variant="heading">{category.name}</AppText>
                {category.items.map((item) => (
                  <View key={item.name} style={styles.item}>
                    <View style={styles.itemBody}>
                      <View style={styles.itemTitleRow}>
                        <AppText variant="bodyMedium">{item.name}</AppText>
                        {item.isPopular ? <Badge label="Popular" tone="accent" /> : null}
                        {item.isVegetarian ? <Badge label="Veg" tone="success" /> : null}
                      </View>
                      {item.description ? (
                        <AppText variant="secondary">{item.description}</AppText>
                      ) : null}
                    </View>
                    <AppText variant="label">{formatPrice(item.price)}</AppText>
                  </View>
                ))}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
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
  titleBlock: { gap: spacing.xs },
  list: { gap: spacing.lg },
  category: { gap: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemBody: { flex: 1, gap: 3 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
