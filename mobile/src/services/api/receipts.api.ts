import { apiClient, type ApiEnvelope } from './client';
import type { ReservationStatus } from './types';

export type ReceiptCustomer = {
  name: string;
  email: string;
  phone: string;
};

export type ReceiptRestaurant = {
  name: string;
  address: string;
  city: string;
  phone: string;
  cuisine: string;
};

export type ReceiptTable = {
  tableId: string;
  tableNumber: string;
  capacity: number;
  location: string;
  type: string;
};

export type ReceiptReservation = {
  partySize: number;
  date: string;
  dateFormatted: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  durationHours: number;
  specialRequest?: string;
  guestName?: string;
  guestPhone?: string;
};

export type ReceiptPricing = {
  hourlyRate: number;
  durationHours: number;
  durationMinutes: number;
  subtotal: number;
  reservationFee: number;
  currency: string;
};

export type ReceiptPayment = {
  status: 'unpaid' | 'paid' | 'refunded';
  statusLabel: string;
  paymentMethod: string;
  paidAt?: string | null;
};

export type ReceiptCancellationPolicy = {
  noticeRequiredHours: number;
  policyText: string;
};

export type ReceiptCancellationDetails = {
  requestedAt?: string | null;
  reason?: string;
  reviewedAt?: string | null;
  reviewComment?: string;
};

export type ReceiptVersionSummary = {
  id: string;
  version: number;
  receiptNumber: string;
  status: 'current' | 'superseded';
  issuedAt: string;
  supersededAt?: string | null;
};

export type Receipt = {
  id: string;
  receiptNumber: string;
  bookingReference: string;
  reservationId: string;
  version: number;
  status: 'current' | 'superseded';
  customer: ReceiptCustomer;
  restaurant: ReceiptRestaurant;
  table: ReceiptTable;
  reservation: ReceiptReservation;
  pricing: ReceiptPricing;
  payment: ReceiptPayment;
  cancellationPolicy: ReceiptCancellationPolicy;
  reservationStatus: ReservationStatus;
  cancellationDetails?: ReceiptCancellationDetails;
  issuedAt: string;
  supersededAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReceiptResponse = {
  receipt: Receipt;
  versions: ReceiptVersionSummary[];
};

/**
 * Fetch the latest receipt and version history for a reservation.
 */
export async function fetchReservationReceipt(reservationId: string) {
  const { data } = await apiClient.get<ApiEnvelope<ReceiptResponse>>(
    `/reservations/${reservationId}/receipt`,
  );
  return data;
}

/**
 * Fetch a specific receipt version by its ID or receiptNumber.
 */
export async function fetchReceiptById(receiptIdOrNumber: string) {
  const { data } = await apiClient.get<ApiEnvelope<ReceiptResponse>>(
    `/receipts/${receiptIdOrNumber}`,
  );
  return data;
}

