import { apiClient, type ApiEnvelope } from './client';
import type { Offer } from './types';

export type OfferInput = Omit<
  Offer,
  'id' | 'restaurantId' | 'createdAt' | 'updatedAt'
>;

export async function fetchManagerOffers() {
  const { data } = await apiClient.get<ApiEnvelope<Offer[]>>('/manager/offers');
  return data;
}

export async function createManagerOffer(input: OfferInput) {
  const { data } = await apiClient.post<ApiEnvelope<Offer>>('/manager/offers', input);
  return data;
}

export async function updateManagerOffer(id: string, input: OfferInput) {
  const { data } = await apiClient.put<ApiEnvelope<Offer>>(`/manager/offers/${id}`, input);
  return data;
}

export async function deleteManagerOffer(id: string) {
  const { data } = await apiClient.delete<ApiEnvelope<{ id: string }>>(`/manager/offers/${id}`);
  return data;
}

export async function fetchEligibleOffers(restaurantId: string) {
  const { data } = await apiClient.get<ApiEnvelope<Offer[]>>(
    `/restaurants/${restaurantId}/offers`,
  );
  return data;
}
