export type UserRole = 'customer' | 'staff' | 'manager';

export type NotificationPrefs = {
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  profileImage: string;
  /** Staff and manager accounts belong to a venue (spec §2). */
  restaurantId?: string | null;
  notificationPrefs?: NotificationPrefs;
  pushToken?: string;
};

export type AuthSession = {
  token: string;
  /** Long-lived refresh token used by POST /auth/refresh (spec §7). */
  refreshToken?: string;
  user: AuthUser;
};

export type AuthHydration = {
  session: AuthSession | null;
  user: AuthUser | null;
};

export type AuthOtpChallenge = {
  email: string;
  maskedEmail: string;
  expiresInSeconds: number;
  deliveryFrom: string;
  otpId: string;
};