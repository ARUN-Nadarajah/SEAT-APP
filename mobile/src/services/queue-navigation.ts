let pendingRestaurantId: string | null = null;

export function setPendingQueueRestaurant(restaurantId: string) {
  pendingRestaurantId = restaurantId;
}

export function consumePendingQueueRestaurant(): string | null {
  const restaurantId = pendingRestaurantId;
  pendingRestaurantId = null;
  return restaurantId;
}
