import { API_BASE_URL } from '../constants/api';

export class ApiError extends Error {
  status: number;
  data?: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let authToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;
let onRateLimitCallback: ((message?: string) => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = (): string | null => {
  return authToken;
};

export const setOnUnauthorizedHandler = (callback: (() => void) | null) => {
  onUnauthorizedCallback = callback;
};

export const setOnRateLimitHandler = (callback: ((message?: string) => void) | null) => {
  onRateLimitCallback = callback;
};

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Universal 401 interceptor (excluding login/register auth endpoints)
  if (response.status === 401 && !endpoint.includes('/api/auth/')) {
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  // 429 Rate Limit Interceptor
  if (response.status === 429) {
    const rateLimitText = await response.text().catch(() => 'Rate limit exceeded');
    let message = 'Rate limit or token limit reached. Please try again later.';
    try {
      const parsed = JSON.parse(rateLimitText);
      if (parsed?.error || parsed?.message) {
        message = parsed.error || parsed.message;
      }
    } catch (_) {}

    if (onRateLimitCallback) {
      onRateLimitCallback(message);
    }
    throw new ApiError(message, 429);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Network response was not ok');
    let message = errorText || `HTTP ${response.status}`;
    let errData: any = null;
    try {
      const jsonErr = JSON.parse(errorText);
      errData = jsonErr;
      if (jsonErr && (jsonErr.error || jsonErr.message)) {
        message = jsonErr.error || jsonErr.message;
      }
    } catch (_) {
      if (errorText.includes('Cannot POST') || errorText.includes('<!DOCTYPE') || response.status === 404) {
        message = 'Server route not found (HTTP 404). Please restart your backend server process to load the newly registered routes.';
      }
    }
    throw new ApiError(message, response.status, errData);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return {} as T;
}
