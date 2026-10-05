import Constants from 'expo-constants';

/**
 * API configuration (spec §10: API base URL config).
 *
 * Reads, in priority order:
 *   1. EXPO_PUBLIC_API_URL / EXPO_PUBLIC_SOCKET_URL (see .env.example)
 *   2. expo.json `extra.apiUrl`
 *   3. localhost defaults for iOS simulator + Expo web
 */
function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  const extra = Constants.expoConfig?.extra?.apiUrl;

  return stripTrailingSlash(explicit || extra || 'http://localhost:5001/api');
}

export function getSocketUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_SOCKET_URL;
  // Derive the Socket.IO origin from the API URL when not set explicitly.
  const derived = getApiBaseUrl().replace(/\/api$/, '');
  return stripTrailingSlash(explicit || derived);
}

/** Android emulator reaches the host machine via 10.0.2.2. */
export function normalizeUrl(url: string): string {
  if (url.startsWith('http://localhost')) {
    return url.replace('http://localhost', 'http://10.0.2.2');
  }
  return url;
}
