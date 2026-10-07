import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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
import { apiErrorMessage, fetchMenu, type MenuItem } from '@/services/api';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';
import { colors, radius, spacing } from '@/theme';

function formatPrice(price: number): string {
  return `LKR ${price.toLocaleString()}`;
}

/** "A taste of …" menu screen (spec §5). */
export default function MenuScreen() {
  const { id, orderType = 'takeaway', reservationId, tableId } =
    useLocalSearchParams<{ id: string; orderType?: string; reservationId?: string; tableId?: string }>();
  const [cart, setCart] = useState<Record<string, { item: MenuItem; quantity: number }>>({});

  const restaurantId = id || EXPLORE_RESTAURANT_ID;
  const query = useApiQuery(['menu', restaurantId], () => fetchMenu(restaurantId), {
    enabled: Boolean(restaurantId),
  });
  const cartLines = Object.values(cart);
  const totalItems = cartLines.reduce((sum, line) => sum + line.quantity, 0);

  function changeQuantity(item: MenuItem, delta: number) {
    const key = item.menuItemId ?? item.id ?? item._id ?? item.name;
    setCart((current) => {
      const next = { ...current };
      const quantity = (next[key]?.quantity ?? 0) + delta;
      if (quantity <= 0) delete next[key];
      else next[key] = { item, quantity };
      return next;
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
                {category.items.map((item) => {
                  const key = item.menuItemId ?? item.id ?? item._id ?? item.name;
                  const quantity = cart[key]?.quantity ?? 0;
                  return (
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
                    <View style={styles.itemActions}>
                      <AppText variant="label">{formatPrice(item.price)}</AppText>
                      <View style={styles.stepper}>
                        <Pressable onPress={() => changeQuantity(item, -1)} style={styles.step}><AppText variant="label">−</AppText></Pressable>
                        <AppText variant="label">{quantity}</AppText>
                        <Pressable onPress={() => changeQuantity(item, 1)} style={styles.step}><AppText variant="label">+</AppText></Pressable>
                      </View>
                    </View>
                  </View>
                  );
                })}
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
      {totalItems > 0 ? (
        <View style={styles.cartBar}>
          <AppText variant="label">{totalItems} item{totalItems === 1 ? '' : 's'} in cart</AppText>
          <Pressable
            style={styles.viewCart}
            onPress={() => router.push({
              pathname: '/orders/review',
              params: {
                restaurantId,
                orderType,
                reservationId,
                tableId,
                cart: JSON.stringify(cartLines.map(({ item, quantity }) => ({
                  ...item,
                  menuItemId: item.menuItemId ?? item.id ?? item._id,
                  quantity,
                }))),
              },
            })}
          >
            <AppText variant="button" style={styles.viewCartText}>View cart</AppText>
          </Pressable>
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
  itemActions: { alignItems: 'flex-end', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cartBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewCart: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg },
  viewCartText: { color: colors.textOnPrimary },
});
