import { io, type Socket } from 'socket.io-client';

import { getSocketUrl } from '../api/config';

/**
 * Socket.IO client (spec §7 / FR05, FR06, FR08).
 *
 * One shared socket per app instance; screens join a venue room and
 * unsubscribe on unmount. Every handler returns its own unsubscribe
 * function so React effects clean up safely.
 */

let socket: Socket | null = null;

export type Unsubscribe = () => void;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

/** Subscribe to a venue room (also registers the events you care about). */
export function subscribeToRestaurant(
  restaurantId: string,
  events: Record<string, (payload: any) => void>,
): Unsubscribe {
  const active = getSocket();
  active.emit('queue:subscribe', { restaurantId });
  active.emit('table:subscribe', { restaurantId });
  active.emit('order:subscribe', { restaurantId });

  const entries = Object.entries(events);
  for (const [event, handler] of entries) {
    active.on(event, handler);
  }

  return () => {
    for (const [event, handler] of entries) {
      active.off(event, handler);
    }
    active.emit('queue:unsubscribe', { restaurantId });
    active.emit('order:unsubscribe', { restaurantId });
  };
}

/** FR05 — queue position/size changed. */
export function onQueueUpdated(
  restaurantId: string,
  handler: (payload: unknown) => void,
): Unsubscribe {
  return subscribeToRestaurant(restaurantId, { 'queue:updated': handler });
}

/** FR06 — "your table is ready". */
export function onQueueReady(
  restaurantId: string,
  handler: (payload: unknown) => void,
): Unsubscribe {
  return subscribeToRestaurant(restaurantId, { 'queue:ready': handler });
}

/** FR08 — a table changed status. */
export function onTableUpdated(
  restaurantId: string,
  handler: (payload: unknown) => void,
): Unsubscribe {
  return subscribeToRestaurant(restaurantId, { 'table:updated': handler });
}

/** Kitchen order updated (Sobiyan). */
export function onOrderUpdated(
  restaurantId: string,
  handler: (payload: unknown) => void,
): Unsubscribe {
  return subscribeToRestaurant(restaurantId, { 'order:updated': handler });
}

/** Kitchen order ready for collection / service (Sobiyan). */
export function onOrderReady(
  restaurantId: string,
  handler: (payload: unknown) => void,
): Unsubscribe {
  return subscribeToRestaurant(restaurantId, { 'order:ready': handler });
}
