import { getApiBaseUrl as getSharedApiBaseUrl } from '@/services/api/config';

type ApiResponse<T> = {
  status?: string;
  message?: string;
  data?: T;
};

function getApiBaseUrl() {
  return getSharedApiBaseUrl();
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