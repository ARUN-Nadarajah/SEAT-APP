import { apiClient, type ApiEnvelope } from './client';
import type { QueueEntry, QueuePreview, StaffQueueRow } from './types';

/**
 * Virtual queue (spec §7 / FR03–FR06, FR09).
 */

export async function fetchQueuePreview(restaurantId: string) {
  const { data } = await apiClient.get<ApiEnvelope<QueuePreview>>(
    '/queue/preview',
    { params: { restaurantId } },
  );
  return data;
}

export type JoinQueueInput = {
  restaurantId: string;
  orderId?: string;
  orderSummary?: string;
  guestName?: string;
  guestPhone?: string;
};

export async function joinQueue(input: JoinQueueInput) {
  const { data } = await apiClient.post<ApiEnvelope<QueueEntry>>(
    '/queue/join',
    input,
  );
  return data;
}

/** Returns `data: null` when the customer is not in any queue (empty state). */
export async function fetchMyQueue(restaurantId?: string) {
  const { data } = await apiClient.get<ApiEnvelope<QueueEntry | null>>(
    '/queue/mine',
    { params: restaurantId ? { restaurantId } : undefined },
  );
  return data;
}

export async function leaveQueue(entryId: string) {
  const { data } = await apiClient.delete(`/queue/${entryId}`);
  return data;
}

/** FR09 — staff view of the live line. */
export async function fetchStaffQueue(restaurantId: string) {
  const { data } = await apiClient.get<ApiEnvelope<StaffQueueRow[]>>(
    '/queue/staff/list',
    { params: { restaurantId } },
  );
  return data;
}

export type CalledOrder = {
  entryId: string;
  queueCode: string;
  guestName: string;
  status: string;
};

/** Promote the next party and tell them their table is ready (FR06). */
export async function callNextOrder(restaurantId: string) {
  const { data } = await apiClient.post<ApiEnvelope<CalledOrder>>(
    '/queue/staff/call-next',
    { restaurantId },
  );
  return data;
}

export async function removeFromQueue(
  entryId: string,
  restaurantId: string,
  reason: 'no-show' | 'cancelled' = 'no-show',
) {
  const { data } = await apiClient.post(`/queue/staff/${entryId}/remove`, {
    restaurantId,
    reason,
  });
  return data;
}

/** Staff marks parcel as ready and alerts customer (Sobiyan). */
export async function markQueueReady(entryId: string, restaurantId: string) {
  const { data } = await apiClient.post(`/queue/staff/${entryId}/ready`, {
    restaurantId,
  });
  return data;
}

/** Staff marks parcel as collected (Sobiyan). */
export async function markQueueCollected(entryId: string, restaurantId: string) {
  const { data } = await apiClient.post(`/queue/staff/${entryId}/collected`, {
    restaurantId,
  });
  return data;
}
