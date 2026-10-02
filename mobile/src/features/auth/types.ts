export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'staff' | 'admin';
  profileImage: string;
};

export type AuthSession = {
  token: string;
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