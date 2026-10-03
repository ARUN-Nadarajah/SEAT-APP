import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  Badge,
  EmptyState,
  ErrorState,
  LastUpdated,
  RowSkeleton,
  useFeedback,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/useApi';
import {
  apiErrorMessage,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/api';
import { colors, radius, spacing } from '@/theme';

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  reservation: 'calendar-outline',
  queue: 'people-outline',
  'table-ready': 'restaurant',
  'queue-update': 'sync-outline',
  account: 'person-outline',
  general: 'notifications-outline',
};

/** Notifications list (spec §5). */
export default function NotificationsScreen() {
  const { showToast } = useFeedback();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const query = useApiQuery(['notifications', filter], () =>
    fetchNotifications(filter === 'unread'),
  );

  const rows = query.data?.data ?? [];
  const unread = query.data?.unreadCount ?? 0;

  async function onOpen(id: string, route?: string) {
    try {
      await markNotificationRead(id);
      query.refetch();
      if (route) router.push(route as never);
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  }

  async function onMarkAll() {
    try {
      await markAllNotificationsRead();
      query.refetch();
      showToast('All caught up.', 'success');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
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
          <AppText variant="label">Notifications</AppText>
          <AppText variant="caption">
            {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
          </AppText>
        </View>
        <View style={styles.back} />
      </View>

      <View style={styles.filters}>
        <Chip
          label="All"
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <Chip
          label={`Unread${unread ? ` (${unread})` : ''}`}
          selected={filter === 'unread'}
          onPress={() => setFilter('unread')}
        />
        <View style={styles.spacer} />
        <Pressable onPress={onMarkAll} accessibilityRole="button" style={styles.markAll}>
          <AppText variant="label" style={styles.markAllText}>
            Mark all read
          </AppText>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LastUpdated timestamp={query.data?.lastUpdated} />

        {query.isLoading ? (
          <RowSkeleton count={4} />
        ) : query.isError ? (
          <ErrorState message={apiErrorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            message="Booking confirmations, queue updates and table-ready alerts land here."
            glyph="🔔"
          />
        ) : (
          <View style={styles.list}>
            {rows.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onOpen(item.id, item.route)}
                style={[styles.item, !item.read && styles.itemUnread]}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.body}`}
              >
                <View style={[styles.icon, !item.read && styles.iconUnread]}>
                  <Ionicons
                    name={TYPE_ICONS[item.type] ?? 'notifications-outline'}
                    size={17}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemTop}>
                    <AppText variant="label" style={styles.itemTitle} numberOfLines={1}>
                      {item.title}
                    </AppText>
                    {!item.read ? <Badge label="New" tone="accent" /> : null}
                  </View>
                  <AppText variant="secondary" numberOfLines={2}>
                    {item.body}
                  </AppText>
                  <AppText variant="caption">{relativeTime(item.createdAt)}</AppText>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <AppText variant="label" style={selected ? styles.chipTextActive : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  spacer: { flex: 1 },
  markAll: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  markAllText: { color: colors.primary, textDecorationLine: 'underline' },
  chip: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTextActive: { color: colors.textOnPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.lg },
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  itemUnread: { borderColor: colors.primary, backgroundColor: colors.infoBox },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.accent },
  itemBody: { flex: 1, gap: 3 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { flex: 1 },
});
