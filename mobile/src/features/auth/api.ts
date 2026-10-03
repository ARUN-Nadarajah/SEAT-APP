import Constants from 'expo-constants';

type ApiResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
};

function getApiBaseUrl() {
  const explicitUrl = process.env.EXPO_PUBLIC_API_URL;
  const expoUrl = Constants.expoConfig?.extra?.apiUrl;

  return (explicitUrl || expoUrl || 'http://localhost:5000/api').replace(/\/$/, '');
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();

  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    return text ? ({ message: text } as ApiResponse<T>) : {};
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await parseResponse<T>(response);

  if (!response.ok) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }

  return payload;
}

export function getApiUrl() {
  return getApiBaseUrl();
}