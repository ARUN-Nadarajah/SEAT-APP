import { apiClient, type ApiEnvelope } from './client';
import type { Order, OrderStatus, OrderType } from './types';

/**
 * Orders API (Sobiyan staff/kitchen integration & Lowmika orders).
 */

/** Kitchen active order list for staff rail (Sobiyan). */
export async function fetchKitchenOrders(restaurantId: string, status?: OrderStatus) {
  const { data } = await apiClient.get<ApiEnvelope<Order[]>>('/orders/kitchen', {
    params: { restaurantId, status },
  });
  return data;
}

/** Update order status: pending -> preparing -> ready -> served / completed (Sobiyan). */
export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const { data } = await apiClient.patch<ApiEnvelope<{ order: Order }>>(
    `/orders/${orderId}/status`,
    { status },
  );
  return data;
}

export type CreateOrderInput = {
  restaurantId: string;
  orderType: OrderType;
  items: Array<{ menuItemId: string; name: string; price: number; quantity: number; note?: string }>;
  notes?: string;
  reservationId?: string;
  tableId?: string;
};

export async function createOrder(input: CreateOrderInput) {
  const { data } = await apiClient.post<ApiEnvelope<{ order: Order }>>('/orders', input);
  return data;
}

export async function cancelOrder(orderId: string) {
  const { data } = await apiClient.post<ApiEnvelope<{ order: Order }>>(
    `/orders/${orderId}/cancel`,
  );
  return data;
}

/** General order listing. */
export async function fetchOrders(params?: { restaurantId?: string; status?: string }) {
  const { data } = await apiClient.get<ApiEnvelope<Order[]>>('/orders', {
    params,
  });
  return data;
}

/** Single order details. */
export async function fetchOrder(id: string) {
  const { data } = await apiClient.get<ApiEnvelope<{ order: Order }>>(`/orders/${id}`);
  return data;
}
