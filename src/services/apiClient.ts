import { API_BASE_URL } from '../constants/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;
let onUnauthorizedCallback: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = (): string | null => {
  return authToken;
};

export const setOnUnauthorizedHandler = (callback: (() => void) | null) => {
  onUnauthorizedCallback = callback;
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

  if (response.status === 401 && endpoint.includes('/api/user/settings')) {
    if (onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Network response was not ok');
    let message = errorText || `HTTP ${response.status}`;
    try {
      const jsonErr = JSON.parse(errorText);
      if (jsonErr && jsonErr.error) {
        message = jsonErr.error;
      }
    } catch (_) {
      if (errorText.includes('Cannot POST') || errorText.includes('<!DOCTYPE') || response.status === 404) {
        message = 'Server route not found (HTTP 404). Please restart your backend server process to load the newly registered routes.';
      }
    }
    throw new ApiError(message, response.status);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return {} as T;
}
