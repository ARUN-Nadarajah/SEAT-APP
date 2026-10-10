import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiRequest } from './api';
import type { AuthHydration, AuthOtpChallenge, AuthSession, AuthUser } from './types';

const SESSION_KEY = 'seat-app.auth.session.v2';
const RESET_KEY = 'seat-app.auth.reset-email.v2';

type AuthResult = {
  user: AuthUser | null;
  session: AuthSession | null;
  notice: { type: 'success' | 'warning'; message: string };
};

async function saveSession(session: AuthSession | null) {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }

  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function loadSession(): Promise<AuthSession | null> {
  const rawSession = await AsyncStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as AuthSession;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function extractAuthData(response: unknown): {
  token: string;
  refreshToken?: string;
  user: AuthUser;
} {
  const payload = response as {
    token?: string;
    accessToken?: string;
    refreshToken?: string;
    user?: AuthUser;
  };

  const token = payload.token || payload.accessToken;

  if (!token || !payload.user) {
    throw new Error('Authentication response was incomplete.');
  }

  return { token, refreshToken: payload.refreshToken, user: payload.user };
}

function buildSession(
  token: string,
  user: AuthUser,
  refreshToken?: string,
): AuthSession {
  return { token, user, refreshToken };
}

async function saveResetEmail(email: string | null) {
  if (!email) {
    await AsyncStorage.removeItem(RESET_KEY);
    return;
  }

  await AsyncStorage.setItem(RESET_KEY, email);
}

export async function hydrateAuth(): Promise<AuthHydration> {
  const session = await loadSession();

  if (!session) {
    return { session: null, user: null };
  }

  try {
    const response = await apiRequest<{ user: AuthUser }>("/auth/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.data?.user) {
      throw new Error("Profile response was empty.");
    }

    const refreshedSession = buildSession(
      session.token,
      response.data.user,
      session.refreshToken,
    );
    await saveSession(refreshedSession);

    return { session: refreshedSession, user: response.data.user };
  } catch {
    await saveSession(null);
    return { session: null, user: null };
  }
}

export async function requestRegisterOtp(input: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  /** Spec §5: role selection. */
  role?: 'customer' | 'staff' | 'manager';
}): Promise<{ challenge: AuthOtpChallenge; message: string }> {
  const response = await apiRequest<AuthOtpChallenge>("/auth/register/request-otp", {
    method: "POST",
    body: JSON.stringify({ ...input, role: input.role || 'customer' }),
  });

  return {
    challenge: response.data as AuthOtpChallenge,
    message: response.message || "Verification code sent to your email.",
  };
}

export async function loginWithPassword(email: string, password: string): Promise<AuthResult> {
  const response = await apiRequest<{ token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  const { token, user, refreshToken } = extractAuthData(response.data);
  const session = buildSession(token, user, refreshToken);
  await saveSession(session);

  return {
    user,
    session,
    notice: { type: 'success', message: response.message || 'Logged in successfully.' },
  };
}

export async function verifyRegisterOtp(email: string, otp: string): Promise<AuthResult> {
  const response = await apiRequest<{ token: string; user: AuthUser }>("/auth/register/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });

  const { token, user, refreshToken } = extractAuthData(response.data);
  const session = buildSession(token, user, refreshToken);
  await saveSession(session);

  return {
    user,
    session,
    notice: { type: 'success', message: response.message || 'Account verified successfully.' },
  };
}

export async function requestPasswordResetOtp(email: string): Promise<{ challenge: AuthOtpChallenge; message: string }> {
  const response = await apiRequest<AuthOtpChallenge>("/auth/password/request-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  await saveResetEmail(email);

  return {
    challenge: response.data as AuthOtpChallenge,
    message: response.message || 'Password reset code sent to your email.',
  };
}

export async function verifyPasswordResetOtp(email: string, otp: string, newPassword: string): Promise<AuthResult> {
  const response = await apiRequest<{ token: string; user: AuthUser }>("/auth/password/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp, newPassword }),
  });

  const { token, user, refreshToken } = extractAuthData(response.data);
  const session = buildSession(token, user, refreshToken);
  await saveSession(session);
  await saveResetEmail(null);

  return {
    user,
    session,
    notice: { type: 'success', message: response.message || 'Password updated successfully.' },
  };
}

export async function logout(): Promise<void> {
  const session = await loadSession();

  if (session) {
    await apiRequest("/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    }).catch(() => undefined);
  }

  await Promise.all([saveSession(null), saveResetEmail(null)]);
}

export async function getPendingResetEmail() {
  return AsyncStorage.getItem(RESET_KEY);
}