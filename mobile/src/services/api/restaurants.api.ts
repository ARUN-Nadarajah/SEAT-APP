import { apiClient, type ApiEnvelope } from './client';
import type {
  Menu,
  RestaurantCard,
  RestaurantDetail,
  TimeSlot,
} from './types';

/**
 * Restaurants (spec §7 / FR01, FR02).
 * Every call returns `lastUpdated` for the "Last updated" stamp (NFR03).
 */

export type RestaurantFilters = {
  q?: string;
  cuisine?: string;
  tonight?: boolean;
  partySize?: number;
  date?: string;
  page?: number;
  limit?: number;
};

export async function fetchRestaurants(filters: RestaurantFilters = {}) {
  const { data } = await apiClient.get<ApiEnvelope<RestaurantCard[]>>(
    '/restaurants',
    {
      params: {
        ...filters,
        tonight: filters.tonight ? '1' : undefined,
      },
    },
  );
  return data;
}

export async function fetchRestaurant(
  id: string,
  options: { date?: string; partySize?: number } = {},
) {
  const { data } = await apiClient.get<ApiEnvelope<RestaurantDetail>>(
    `/restaurants/${id}`,
    { params: options },
  );
  return data;
}

export async function fetchSlots(
  id: string,
  options: { date?: string; partySize?: number } = {},
) {
  const { data } = await apiClient.get<
    ApiEnvelope<TimeSlot[]> & { alternatives: TimeSlot[] }
  >(`/restaurants/${id}/slots`, { params: options });
  return data;
}

export async function fetchMenu(id: string) {
  const { data } = await apiClient.get<ApiEnvelope<Menu>>(
    `/restaurants/${id}/menu`,
  );
  return data;
}
