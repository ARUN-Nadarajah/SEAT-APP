import { apiClient, type ApiEnvelope } from './client';
import type { Booking, BookingList, SlotAlternative, TimeSlot } from './types';

/**
 * Reservations (spec §7 / FR02, FR07, FR09).
 *
 * Errors carry `code: "slot_unavailable"` plus `details.alternatives` when a
 * time has just been taken — the Change/Reserve screens show those inline.
 */

export type CreateBookingInput = {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
    tableId?: string;
  guestName?: string;
  specialRequest?: string;
};

export type SlotUnavailableError = {
  code: 'slot_unavailable';
  message: string;
  alternatives: SlotAlternative[];
};

/** Normalise a 409 slot clash into a typed, displayable error. */
export function parseSlotUnavailable(error: unknown): SlotUnavailableError | null {
  const response = (error as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 409) return null;

  const data = response.data as
    | { code?: string; message?: string; details?: { alternatives?: SlotAlternative[] } }
    | undefined;

  if (data?.code !== 'slot_unavailable') return null;

  return {
    code: 'slot_unavailable',
    message: data.message || 'That time is no longer available.',
    alternatives: data.details?.alternatives ?? [],
  };
}

export async function createBooking(input: CreateBookingInput) {
  const { data } = await apiClient.post<ApiEnvelope<{ reservation: Booking }>>(
    '/reservations',
    input,
  );
  return data;
}

export async function fetchMyBookings() {
  const { data } = await apiClient.get<ApiEnvelope<BookingList>>('/reservations');
  return data;
}

export async function fetchBooking(id: string) {
  const { data } = await apiClient.get<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}`,
  );
  return data;
}

export type UpdateBookingInput = {
  date?: string;
  time?: string;
  partySize?: number;
  specialRequest?: string;
};

export async function updateBooking(id: string, input: UpdateBookingInput) {
  const { data } = await apiClient.put<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}`,
    input,
  );
  return data;
}

export async function requestCancellation(id: string, reason: string) {
  const { data } = await apiClient.post<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}/cancel-request`,
    { reason },
  );
  return data;
}

export async function cancelBooking(id: string, reason = '') {
  const { data } = await apiClient.delete<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}`,
    { data: { reason } },
  );
  return data;
}

/** Staff cancellation approval (Sobiyan). */
export async function approveCancellation(id: string) {
  const { data } = await apiClient.post<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}/approve-cancellation`,
  );
  return data;
}

/** Staff cancellation rejection (Sobiyan). */
export async function rejectCancellation(id: string, comment?: string) {
  const { data } = await apiClient.post<ApiEnvelope<{ reservation: Booking }>>(
    `/reservations/${id}/reject-cancellation`,
    { comment },
  );
  return data;
}

/** FR09 — today's list with search, for the staff dashboard. */
export async function fetchStaffReservations(params: {
  restaurantId: string;
  date?: string;
  q?: string;
  status?: string;
}) {
  const { data } = await apiClient.get<ApiEnvelope<Booking[]>>(
    '/reservations/staff',
    { params },
  );
  return data;
}

export async function checkInBooking(id: string, restaurantId: string) {
  const { data } = await apiClient.post(`/reservations/${id}/check-in`, {
    restaurantId,
  });
  return data;
}

export async function markNoShow(id: string, restaurantId: string) {
  const { data } = await apiClient.post(`/reservations/${id}/no-show`, {
    restaurantId,
  });
  return data;
}

/** Alternative slots when the requested time disappeared (FR07). */
export async function fetchAlternativeSlots(
  restaurantId: string,
  options: { date: string; partySize: number },
) {
  const { data } = await apiClient.get<ApiEnvelope<TimeSlot[]>>(
    `/restaurants/${restaurantId}/slots`,
    { params: options },
  );
  return data;
}
