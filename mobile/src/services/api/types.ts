/**
 * Domain types mirroring the backend responses (spec §6/§7).
 * Keeping them in one place means screens share exactly one shape per entity.
 */

export type LastUpdated = { lastUpdated?: string };

export type WaitEstimate = {
  minutes: number;
  min: number;
  max: number;
  label: string;
};

export type RestaurantCard = {
  id: string;
  name: string;
  cuisine: string;
  description: string;
  image: string;
  images: string[];
  rating: number;
  reviewCount: number;
  priceRange: string;
  address: string;
  city: string;
  distanceMeters: number;
  openHoursLabel: string;
  parking: boolean;
  parkingLabel: string;
  isQueueEnabled: boolean;
  /** "Tonight from 7:00 PM" (FR01). */
  firstSlotLabel: string;
  /** "15–25 min walk-in wait" (FR01). */
  walkInWaitLabel: string;
  availableTables: number;
  availabilityStatus: 'available' | 'limited' | 'fully-booked';
  queueLength: number;
} & LastUpdated;

export type Availability = {
  totalTables: number;
  availableTables: number;
  availableSlots: number;
  isFullyBooked: boolean;
  queueLength: number;
  firstSlot: { time: string; label: string } | null;
  firstSlotLabel: string;
  walkInWait: WaitEstimate & { label: string };
  status: 'available' | 'limited' | 'fully-booked';
} & LastUpdated;

export type TimeSlot = {
  time: string;
  timeLabel: string;
  available: boolean;
  availableTables: number;
  tableIds: string[];
};

export type RestaurantDetail = RestaurantCard & {
  openingTime: string;
  closingTime: string;
  phone: string;
  location: { lat: number; lng: number };
  averageSeatingMinutes: number;
  availability: Availability;
  slots: TimeSlot[];
};

export type RestaurantInfo = {
  _id: string;
  name: string;
  description: string;
  phone: string;
  address: string;
  openingTime: string;
  closingTime: string;
  cuisine: string;
  parking: boolean;
  parkingLabel: string;
  images: string[];
  updatedAt?: string;
};

export type Offer = {
  id: string;
  restaurantId: string;
  title: string;
  description: string;
  type: 'Percentage' | 'Value';
  value: string;
  requiredReservations: number;
  active: boolean;
  image: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MenuItem = {
  name: string;
  description: string;
  price: number;
  category: string;
  isVegetarian: boolean;
  isPopular?: boolean;
};

export type Menu = {
  restaurant: { id: string; name: string };
  categories: { name: string; items: MenuItem[] }[];
  items: MenuItem[];
};

export type ReservationStatus =
  | 'confirmed'
  | 'checked-in'
  | 'cancellation_pending'
  | 'cancelled'
  | 'completed'
  | 'no-show';

export type Booking = {
  id: string;
  bookingId: string;
  status: ReservationStatus;
  partySize: number;
  date: string;
  time: string;
  endTime: string;
  guestName: string;
  specialRequest: string;
  tableNumber: string;
  tableCapacity: number | null;
  restaurant: {
    id: string;
    name: string;
    cuisine: string;
    image: string;
    address: string;
    city: string;
    rating: number;
  } | null;
  createdAt: string;
  checkedInAt?: string | null;
  cancelledAt?: string | null;
  cancellationRequestedAt?: string | null;
  cancellationReason?: string;
  cancellationReviewedBy?: string | null;
  cancellationReviewedAt?: string | null;
  cancellationReviewComment?: string;
  /** Staff list only. */
  guest?: { name: string; phone: string; email: string };
};

export type BookingList = {
  upcoming: Booking[];
  past: Booking[];
  all: Booking[];
} & LastUpdated;

export type SlotAlternative = { time: string; label: string };

export type QueueStage = 'joined' | 'getting-closer' | 'table-ready';

export type QueueStatus =
  | 'waiting'
  | 'notified'
  | 'seated'
  | 'left'
  | 'no-show'
  | 'preparing'
  | 'ready'
  | 'collected';

export type QueueEntry = {
  id: string;
  queueCode: string;
  parcelToken?: string;
  orderSummary?: string;
  restaurantId: string;
  restaurant: {
    id: string;
    name: string;
    address: string;
    image: string;
  } | null;
  partySize: number;
  position: number;
  partiesAhead: number;
  status: QueueStatus;
  stage: QueueStage;
  estimatedWait: number;
  estimateLabel: string;
  estimatedWaitLabel: string;
  guestName: string;
  heldTableNumber: string;
  joinedAt: string;
  notifiedAt: string | null;
  readyAt?: string | null;
  collectedAt?: string | null;
  seatedAt: string | null;
} & LastUpdated;

export type QueuePreview = {
  restaurantId: string;
  restaurantName: string;
  queueLength: number;
  partiesAhead: number;
  isQueueEnabled: boolean;
  minutes: number;
  min: number;
  max: number;
  label: string;
  estimatedWaitLabel: string;
  freeTables: number;
} & LastUpdated;

export type StaffQueueRow = {
  id: string;
  queueCode: string;
  parcelToken?: string;
  orderSummary?: string;
  partySize: number;
  position: number;
  status: QueueStatus;
  estimatedWait: number;
  estimateLabel: string;
  guestName: string;
  guestPhone: string;
  heldTableNumber: string;
  joinedAt: string;
  notifiedAt: string | null;
  readyAt?: string | null;
  collectedAt?: string | null;
  seatedAt: string | null;
};

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

export type Table = {
  id: string;
  _id?: string;
  tableNumber: string;
  capacity: number;
  location: string;
  type?: string;
  status: TableStatus;
  description?: string;
  image?: string;
  statusChangedAt?: string;
  isActive: boolean;
};

export type TableSummary = {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  route: string;
  data: Record<string, unknown>;
  channel: string;
  createdAt: string;
};

export type ManagerStats = {
  totalReservations: number;
  noShows: number;
  cancelled: number;
  checkedIn: number;
  confirmed: number;
  avgWaitMinutes: number;
  avgWaitLabel: string;
  avgPartySize: number;
  walkIns: number;
  tableSummary: TableSummary;
  changeVsYesterday: string;
  date: string;
} & LastUpdated;

export type HourlyBucket = {
  hour: number;
  label: string;
  reservations: number;
  seated: number;
  avgWait: number;
};

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'completed'
  | 'cancelled';

export type OrderType = 'dine_in' | 'takeaway';

export type OrderItem = {
  foodId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type Order = {
  id: string;
  orderNumber?: string;
  userId?:
    | string
    | {
        id?: string;
        _id?: string;
        name: string;
        phone?: string;
        email?: string;
      }
    | null;
  restaurantId: string;
  reservationId?:
    | string
    | {
        id?: string;
        _id?: string;
        bookingId?: string;
        tableNumber?: string;
      }
    | null;
  tableNumber?: string;
  parcelToken?: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  orderType: OrderType;
  specialInstructions?: string;
  user?: {
    id?: string;
    name: string;
    phone?: string;
    email?: string;
  } | null;
  reservation?: {
    id?: string;
    bookingId?: string;
    tableNumber?: string;
    date?: string;
    time?: string;
  } | null;
  createdAt: string;
  updatedAt?: string;
};

