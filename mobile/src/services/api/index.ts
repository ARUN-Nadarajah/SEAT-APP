/**
 * Single entry point for the API layer.
 *
 *   import { fetchRestaurants, joinQueue } from '@/services/api';
 *
 * Screens import from here so domain modules stay swappable.
 */
export * from './client';
export * from './config';
export * from './types';
export * from './restaurants.api';
export * from './reservations.api';
export * from './queue.api';
export * from './staff.api';
export * from './offers.api';
export * from './orders.api';
