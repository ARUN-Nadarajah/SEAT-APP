import { apiClient, type ApiEnvelope } from './client';
import type {
  AppNotification,
  HourlyBucket,
  ManagerStats,
  Table,
  TableStatus,
  TableSummary,
} from './types';

/** Tables (FR08) — staff floor-plan grid. */
export async function fetchTables(restaurantId: string, date?: string) {
  const { data } = await apiClient.get<
    ApiEnvelope<Table[]> & { summary: TableSummary }
  >('/tables', { params: { restaurantId, date } });
  return data;
}

export async function updateTableStatus(id: string, status: TableStatus) {
  const { data } = await apiClient.patch<ApiEnvelope<Table>>(
    `/tables/${id}/status`,
    { status },
  );
  return data;
}

/** Manager dashboard (FR10 / spec §7 stats endpoint). */
export async function fetchManagerStats(
  restaurantId: string,
  date?: string,
) {
  const { data } = await apiClient.get<
    ApiEnvelope<ManagerStats> & { hourly: HourlyBucket[] }
  >('/manager/stats', { params: { restaurantId, date } });
  return data;
}

export async function fetchDailyBreakdown(
  restaurantId: string,
  options: { from?: string; days?: number } = {},
) {
  const { data } = await apiClient.get<
    ApiEnvelope<{ date: string; reservations: number; seated: number }[]>
  >('/manager/daily', { params: { restaurantId, ...options } });
  return data;
}

/** Notifications (FR06). */
export async function fetchNotifications(unreadOnly = false) {
  const { data } = await apiClient.get<
    ApiEnvelope<AppNotification[]> & { unreadCount: number }
  >('/notifications', { params: unreadOnly ? { unreadOnly: '1' } : undefined });
  return data;
}

export async function markNotificationRead(id: string) {
  const { data } = await apiClient.patch(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.post('/notifications/read-all');
  return data;
}

export async function registerPushToken(pushToken: string) {
  const { data } = await apiClient.post('/notifications/push-token', {
    pushToken,
  });
  return data;
}

/** Profile + notification preferences (Profile screen). */
export async function updateProfile(input: {
  name?: string;
  phone?: string;
  notificationPrefs?: Record<string, boolean>;
  pushToken?: string;
}) {
  const { data } = await apiClient.patch('/auth/me', input);
  return data;
}
