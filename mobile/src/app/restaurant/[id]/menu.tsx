import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  InfoBox,
  Skeleton,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import { apiErrorMessage, fetchMenu, fetchMyQueue, type MenuItem } from '@/services/api';
import { EXPLORE_RESTAURANT_ID } from '@/services/restaurant-config';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

function formatPrice(price: number): string {
  return `LKR ${price.toLocaleString()}`;
}

function itemKey(item: MenuItem): string {
  return item.menuItemId ?? item.id ?? item._id ?? item.name;
}

/**
 * The menu API ships name/description/price only, so every dish the kitchen
 * has photographed gets its photo (and its tags) here. Kept beside the screen
 * on purpose: it is presentation data, not restaurant data.
 */
const DISH_PHOTO: Record<string, string> = {
  'chicken kottu':
    'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
  'chicken fried rice':
    'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
  'cheese burger':
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  'seafood kottu':
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80',
  'fresh lime juice':
    'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
  'vegetable kottu':
    'https://images.unsplash.com/photo-1630409349197-b733a524b24e?w=600&auto=format&fit=crop&q=80',
  watalappan:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Watalappan_%2823091763250%29.jpg/960px-Watalappan_%2823091763250%29.jpg',
  'curd with treacle':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Curd_and_treacle.jpg/960px-Curd_and_treacle.jpg',
};

const DISH_TAGS: Record<string, string[]> = {
  'chicken kottu': ['Spicy', "Chef's pick"],
  'seafood kottu': ['Spicy', "Chef's pick"],
  'vegetable kottu': ['Vegetarian', "Chef's pick"],
  'fresh lime juice': ['Vegetarian'],
  watalappan: ['Vegetarian'],
  'curd with treacle': ['Vegetarian'],
};

type Tag = { label: string; tone: 'success' | 'warning' | 'accent' };

const TAG_TONE: Record<string, Tag['tone']> = {
  Vegetarian: 'success',
  Spicy: 'warning',
  "Chef's pick": 'accent',
};

function tagsFor(item: MenuItem): Tag[] {
  const curated = DISH_TAGS[item.name.trim().toLowerCase()];
  const labels = curated ?? [];
  const haystack = `${item.name} ${item.description}`.toLowerCase();
  const inferred: string[] = [];

  if (item.isVegetarian || /\b(vegetable|veggie|vegan)\b/.test(haystack)) {
    inferred.push('Vegetarian');
  }
  if (/\b(spicy|chilli|chili|pepper)\b/.test(haystack)) inferred.push('Spicy');
  if (item.isPopular) inferred.push("Chef's pick");

  const merged = [...labels, ...inferred].filter(
    (label, index, all) => all.indexOf(label) === index,
  );
  return merged.slice(0, 2).map((label) => ({ label, tone: TAG_TONE[label] ?? 'success' }));
}

function photoFor(item: MenuItem): string | undefined {
  return item.image || DISH_PHOTO[item.name.trim().toLowerCase()] || undefined;
}

/** Square dish photo with a cream + leaf placeholder while it loads. */
function DishPhoto({ uri, name }: { uri?: string; name: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    uri ? 'loading' : 'error',
  );

  return (
    <View style={styles.photo} accessibilityLabel={`${name} photo`}>
      <View style={styles.photoPlaceholder} importantForAccessibility="no">
        <Ionicons name="leaf" size={22} color="#93A97F" />
      </View>
      {uri && status !== 'error' ? (
        <Image
          source={{ uri }}
          style={[styles.photoImage, status === 'ready' ? styles.photoReady : null]}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

/** Lime +/− stepper. Shows a single "+" until the dish is added. */
function Stepper({
  name,
  quantity,
  onAdd,
  onRemove,
}: {
  name: string;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  // Lazy animated value (created outside render, same pattern as Skeleton).
  const [pulse] = useState(() => new Animated.Value(0));

  function add() {
    onAdd();
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, useNativeDriver: true, friction: 5 }),
    ]).start();
  }

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  if (quantity === 0) {
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={add}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Add ${name} to your order`}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[styles.stepper, { transform: [{ scale }] }]}
      accessibilityLabel={`${quantity} × ${name} in your order`}
    >
      <Pressable
        onPress={onRemove}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Remove one ${name}`}
        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
      >
        <Ionicons name="remove" size={20} color={colors.primary} />
      </Pressable>
      <AppText variant="label" style={styles.stepCount} accessibilityLiveRegion="polite">
        {quantity}
      </AppText>
      <Pressable
        onPress={add}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Add another ${name}`}
        style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={20} color={colors.primary} />
      </Pressable>
    </Animated.View>
  );
}

/** Sticky checkout bar — slides in once the first dish is added. */
function OrderBar({
  itemCount,
  total,
  onPress,
}: {
  itemCount: number;
  total: number;
  onPress: () => void;
}) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }, [progress]);

  return (
    <Animated.View
      style={[
        styles.orderBar,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) },
          ],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`View order, ${itemCount} item${itemCount === 1 ? '' : 's'}, ${formatPrice(total)}`}
        style={({ pressed }) => [styles.orderButton, pressed && styles.pressed]}
      >
        <AppText variant="button" style={styles.orderButtonText}>
          {`View order · ${itemCount} item${itemCount === 1 ? '' : 's'} · ${formatPrice(total)}`}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

/** "A taste of …" menu screen (spec §5). */
export default function MenuScreen() {
  const { id, orderType = 'takeaway', reservationId, tableId } =
    useLocalSearchParams<{ id: string; orderType?: string; reservationId?: string; tableId?: string }>();

  const [cart, setCart] = useState<Record<string, { item: MenuItem; quantity: number }>>({});
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  const [sectionOffsets, setSectionOffsets] = useState<Record<string, number>>({});
  const scrollRef = useRef<ScrollView>(null);

  const restaurantId = id || EXPLORE_RESTAURANT_ID;
  const query = useApiQuery(['menu', restaurantId], () => fetchMenu(restaurantId), {
    enabled: Boolean(restaurantId),
  });
  const myQueue = useApiQuery(['queue', 'mine'], () => fetchMyQueue(), {
    enabled: orderType === 'takeaway',
  });

  const menu = query.data?.data;
  const hasActiveQueue = orderType === 'takeaway' && Boolean(myQueue.data?.data);
  const cartLines = Object.values(cart);
  const totalItems = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = cartLines.reduce((sum, line) => sum + line.quantity * line.item.price, 0);

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu?.categories ?? [])
      .map((category) => ({
        name: category.name,
        items: term
          ? category.items.filter((item) =>
              `${item.name} ${item.description}`.toLowerCase().includes(term),
            )
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, search]);

  const selectedCategory = activeCategory ?? visibleCategories[0]?.name ?? null;
  // Child index of the search + category row: the takeaway notice (rendered
  // only for takeaway orders) sits in front of it and shifts it by one.
  const stickyControlsIndex = orderType === 'takeaway' ? 2 : 1;

  function changeQuantity(item: MenuItem, delta: number) {
    if (hasActiveQueue) return;
    setCart((current) => {
      const next = { ...current };
      const key = itemKey(item);
      const quantity = (next[key]?.quantity ?? 0) + delta;
      if (quantity <= 0) delete next[key];
      else next[key] = { item, quantity };
      return next;
    });
  }

  function handleControlsLayout(event: {
    nativeEvent: { layout: { height: number } };
  }) {
    setControlsHeight(event.nativeEvent.layout.height);
  }

  function handleSectionLayout(name: string, y: number) {
    setSectionOffsets((current) =>
      current[name] === y ? current : { ...current, [name]: y },
    );
  }

  function handleScroll(event: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    };
  }) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const categories = visibleCategories;
    if (categories.length === 0) return;
    const scrollable = contentSize.height - layoutMeasurement.height;
    // Nothing to track while the page fits on screen — keep the chip the guest
    // tapped lit instead of snapping back to the first section.
    if (scrollable <= 8) return;

    let current: string;
    if (contentOffset.y >= scrollable - 8) {
      // The closing section can never cross the marker, so the list bottom wins.
      current = categories[categories.length - 1].name;
    } else {
      const marker = contentOffset.y + controlsHeight + 12;
      current = categories[0].name;
      for (const category of categories) {
        const offset = sectionOffsets[category.name];
        if (offset !== undefined && offset <= marker) current = category.name;
      }
    }
    setActiveCategory((previous) => (previous === current ? previous : current));
  }

  function scrollToCategory(name: string) {
    setActiveCategory(name);
    const offset = sectionOffsets[name];
    if (offset !== undefined) {
      // -8 keeps a sliver of breathing room under the sticky controls.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(0, offset - controlsHeight - 8),
          animated: true,
        });
      });
    }
  }

  function openOrder() {
    if (hasActiveQueue) return;
    router.push({
      pathname: '/orders/review',
      params: {
        restaurantId,
        orderType,
        reservationId,
        tableId,
        cart: JSON.stringify(
          cartLines.map(({ item, quantity }) => ({
            ...item,
            menuItemId: item.menuItemId ?? item.id ?? item._id,
            quantity,
          })),
        ),
      },
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.appBar}>
        <Pressable
          onPress={() => router.back()}
          style={styles.circleButton}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="label" style={styles.appBarTitle}>
          Menu
        </AppText>
        <Pressable
          onPress={totalItems > 0 ? openOrder : undefined}
          disabled={totalItems === 0}
          style={[styles.circleButton, totalItems > 0 && styles.circleButtonActive]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            totalItems > 0
              ? `View order, ${totalItems} item${totalItems === 1 ? '' : 's'}`
              : 'Your order is empty'
          }
        >
          <Ionicons
            name="cart"
            size={19}
            color={totalItems > 0 ? colors.primary : colors.textMuted}
          />
          {totalItems > 0 ? (
            <View style={styles.cartBadge}>
              <AppText style={styles.cartBadgeText}>
                {totalItems > 9 ? '9+' : totalItems}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          totalItems > 0 ? styles.contentWithBar : null,
        ]}
        stickyHeaderIndices={[stickyControlsIndex]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* The takeaway notice below sits above the sticky search row, so it
            shifts the sticky index by one when it renders. */}
        <View style={styles.hero}>
          <AppText variant="title">
            A taste of {menu?.restaurant.name ?? 'the kitchen'}
          </AppText>
          <AppText variant="secondary">
            Prices in Sri Lankan rupees. Ask your server about allergens.
          </AppText>
        </View>
        {orderType === 'takeaway' ? (
          <InfoBox tone={hasActiveQueue ? 'warning' : 'info'}>
            <AppText variant="label">
              {hasActiveQueue
                ? 'You already have a place in a takeaway queue.'
                : 'You can keep only one place in a takeaway queue per account.'}
            </AppText>
            <AppText variant="secondary">
              {hasActiveQueue
                ? 'Leave your current queue before selecting a new takeaway order.'
                : 'Choose your dishes carefully before joining the queue.'}
            </AppText>
          </InfoBox>
        ) : null}

        <View style={styles.controls} onLayout={handleControlsLayout}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search dishes, e.g. kottu"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="Search the menu"
              returnKeyType="search"
              autoCorrect={false}
            />
            {search ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chipRow}
          >
            {visibleCategories.map((category) => {
              const selected = category.name === selectedCategory;
              return (
                <Pressable
                  key={category.name}
                  onPress={() => scrollToCategory(category.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${category.name} section`}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    selected && styles.categoryChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText
                    style={[
                      styles.categoryChipText,
                      selected && styles.categoryChipTextSelected,
                    ]}
                  >
                    {category.name}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {query.isLoading ? (
          <View style={styles.list}>
            {[0, 1, 2].map((index) => (
              <Card key={index} style={styles.dishCard}>
                <View style={styles.dishRow}>
                  <Skeleton height={88} width={88} radius={radius.md} />
                  <View style={styles.dishBody}>
                    <Skeleton height={16} width="70%" />
                    <Skeleton height={12} width="90%" />
                    <Skeleton height={12} width="55%" />
                    <View style={styles.dishFooter}>
                      <Skeleton height={20} width={70} radius={radius.pill} />
                      <Skeleton height={44} width={44} radius={radius.md} />
                    </View>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : query.isError ? (
          <ErrorState
            message={apiErrorMessage(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : (menu?.categories.length ?? 0) === 0 ? (
          <EmptyState
            title="Menu coming soon"
            message="This restaurant hasn’t uploaded its dishes yet."
            glyph="🍽"
          />
        ) : visibleCategories.length === 0 ? (
          <EmptyState
            title="No dishes found"
            message={`Nothing on the menu matches “${search.trim()}”. Try another dish.`}
            glyph="🔎"
            action={
              <AppText
                variant="label"
                style={styles.clearSearch}
                onPress={() => setSearch('')}
                accessibilityRole="button"
                accessibilityLabel="Clear the search"
              >
                Clear search
              </AppText>
            }
          />
        ) : (
          visibleCategories.map((category) => (
            // onLayout sits on the section wrapper: the offset has to be the
            // section's position inside the scroll content, not inside its own
            // heading row, or every chip reads the same (zero) position.
            <View
              key={category.name}
              onLayout={(event) =>
                handleSectionLayout(category.name, event.nativeEvent.layout.y)
              }
            >
              <View style={styles.sectionHead}>
                <AppText variant="heading">{category.name}</AppText>
                <AppText variant="caption">
                  {category.items.length} item{category.items.length === 1 ? '' : 's'}
                </AppText>
              </View>
              <View style={styles.sectionRule} />

              <View style={styles.list}>
                {category.items.map((item) => {
                  const key = itemKey(item);
                  const quantity = cart[key]?.quantity ?? 0;
                  const tags = tagsFor(item);
                  return (
                    <Card key={key} style={styles.dishCard}>
                      <View style={styles.dishRow}>
                        <DishPhoto uri={photoFor(item)} name={item.name} />
                        <View style={styles.dishBody}>
                          <View style={styles.dishTopRow}>
                            <AppText
                              variant="bodyMedium"
                              style={styles.dishName}
                              numberOfLines={1}
                            >
                              {item.name}
                            </AppText>
                            <AppText variant="label" style={styles.dishPrice}>
                              {formatPrice(item.price)}
                            </AppText>
                          </View>

                          {item.description ? (
                            <AppText variant="secondary" numberOfLines={2} style={styles.dishDescription}>
                              {item.description}
                            </AppText>
                          ) : null}

                          <View style={styles.dishFooter}>
                            <View style={styles.tagRow}>
                              {tags.map((tag) => (
                                <Badge key={tag.label} label={tag.label} tone={tag.tone} />
                              ))}
                            </View>
                            <Stepper
                              name={item.name}
                              quantity={quantity}
                              onAdd={() => changeQuantity(item, 1)}
                              onRemove={() => changeQuantity(item, -1)}
                            />
                          </View>
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {totalItems > 0 ? (
        <OrderBar itemCount={totalItems} total={totalPrice} onPress={openOrder} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  appBarTitle: { color: colors.textSecondary, letterSpacing: 0.4 },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  circleButtonActive: { borderColor: colors.primary },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  cartBadgeText: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textOnPrimary,
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing['4xl'] },
  contentWithBar: { paddingBottom: spacing['5xl'] },
  hero: { paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  controls: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
    ...shadow.card,
    shadowOpacity: 0.08,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  categoryChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  categoryChipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  categoryChipTextSelected: { color: colors.textPrimary },
  list: { gap: spacing.md, paddingTop: spacing.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  sectionRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  dishCard: { padding: spacing.md },
  dishRow: { flexDirection: 'row', gap: spacing.md },
  photo: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  photoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  photoImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  photoReady: { opacity: 1 },
  dishBody: { flex: 1, gap: spacing.xs, minHeight: 88 },
  dishTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dishName: { flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 15 },
  dishPrice: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.textPrimary },
  dishDescription: { color: colors.textSecondary, flexShrink: 1 },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1, flexWrap: 'wrap' },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    minWidth: 18,
    textAlign: 'center',
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  orderBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.raised,
  },
  orderButton: {
    minHeight: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  orderButtonText: { color: colors.primary, fontFamily: fonts.sansBold },
  clearSearch: { color: colors.primary, textDecorationLine: 'underline' },
});
