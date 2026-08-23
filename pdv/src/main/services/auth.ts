import { api } from './api';
import { getItem, setItem, removeItem } from '../utils/storage';
import type { DeviceTokenResponse } from '../../shared/electron';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const DEVICE_ID_KEY = 'device_id';
const BRANCH_ID_KEY = 'branch_id';
const TENANT_ID_KEY = 'tenant_id';
const API_KEY_KEY = 'api_key';

function persistDeviceContext(data: DeviceTokenResponse): void {
  setItem(ACCESS_TOKEN_KEY, data.token);
  setItem(REFRESH_TOKEN_KEY, data.refresh_token);
  setItem(DEVICE_ID_KEY, data.device_id);
  setItem(BRANCH_ID_KEY, data.branch_id ?? '');
  setItem(TENANT_ID_KEY, data.tenant_id);
}

export const auth = {
  async validateApiKey(apiKey: string): Promise<DeviceTokenResponse> {
    const response = await api.post<DeviceTokenResponse>('/devices/validate/', {
      api_key: apiKey,
    });

    const data = response.data;
    persistDeviceContext(data);
    setItem(API_KEY_KEY, apiKey);

    return data;
  },

  async refreshToken(): Promise<DeviceTokenResponse> {
    const refreshToken = getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post<DeviceTokenResponse>('/devices/refresh/', {
      refresh_token: refreshToken,
    });

    persistDeviceContext(response.data);

    return response.data;
  },

  getAccessToken(): string | null {
    return getItem(ACCESS_TOKEN_KEY);
  },

  getRefreshToken(): string | null {
    return getItem(REFRESH_TOKEN_KEY);
  },

  getDeviceId(): string | null {
    return getItem(DEVICE_ID_KEY);
  },

  getBranchId(): string | null {
    return getItem(BRANCH_ID_KEY);
  },

  getApiKey(): string | null {
    return getItem(API_KEY_KEY);
  },

  clearAuth(): void {
    removeItem(ACCESS_TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
    removeItem(DEVICE_ID_KEY);
    removeItem(BRANCH_ID_KEY);
    removeItem(TENANT_ID_KEY);
    removeItem(API_KEY_KEY);
  },

  isAuthenticated(): boolean {
    return !!getItem(ACCESS_TOKEN_KEY);
  },
};
