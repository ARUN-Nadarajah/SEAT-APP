import axios, {
  AxiosError,
  create as axiosCreate,
  isAxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getApiBaseUrl } from './config';

const SESSION_KEY = 'seat-app.auth.session.v2';

export type Session = {
  token: string;
  refreshToken?: string;
  user: { id: string; role: string; [key: string]: unknown };
};

/**
 * Session shape persisted by `features/auth/auth-service`.
 * Read directly so the API layer and the auth feature share one source of truth.
 */
export async function getSession(): Promise<Session | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session | null) {
  if (!session) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return;
  }
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export const apiClient: AxiosInstance = axiosCreate({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

/** Serialize a single in-flight refresh so retries don't stampede. */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const session = await getSession();
  if (!session?.refreshToken) return null;

  try {
    const response = await axios.post(
      `${getApiBaseUrl()}/auth/refresh`,
      { refreshToken: session.refreshToken },
      { timeout: 15000 },
    );

    const data = response.data?.data;
    const accessToken = data?.accessToken || data?.token;
    if (!accessToken) return null;

    const next: Session = {
      ...session,
      token: accessToken,
      refreshToken: data?.refreshToken || session.refreshToken,
      user: { ...session.user, ...(data?.user || {}) },
    };
    await saveSession(next);
    return accessToken;
  } catch {
    // Refresh failed — drop the session so the router sends the user to login.
    await saveSession(null);
    return null;
  }
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const session = await getSession();
  if (session?.token && config.headers) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;

    const status = error.response?.status;
    const isAuthRoute = original?.url?.includes('/auth/login');

    // One transparent retry after refreshing an expired access token (spec §7).
    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();

      const accessToken = await refreshPromise;
      refreshPromise = null;

      if (accessToken && original.headers) {
        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient.request(original);
      }
    }

    return Promise.reject(error);
  },
);

/** Extract the `message` from any API error for inline/toast feedback. */
export function apiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    if (error.code === 'ECONNABORTED' || !error.response) {
      return 'Network unreachable. Check your connection and try again.';
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

/** Standard `{ status, data, ... }` envelope shared by every endpoint. */
export type ApiEnvelope<T> = {
  status: 'success' | 'error';
  message?: string;
  data?: T;
  lastUpdated?: string;
  total?: number;
  [key: string]: unknown;
};
