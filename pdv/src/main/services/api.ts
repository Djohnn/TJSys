import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiUrl, normalizeApiBaseUrl } from '../../shared/apiUrl';
import { getItem, setItem, removeItem } from '../utils/storage';

const API_BASE_URL = normalizeApiBaseUrl(process.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1/');

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const tenantId = getItem('tenant_id');
    if (tenantId) {
      config.headers['X-Tenant-ID'] = tenantId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(apiUrl(API_BASE_URL, '/devices/refresh/'), {
          refresh_token: refreshToken,
        });

        const { token, refresh_token: newRefreshToken } = response.data;
        if (token) setItem('access_token', token);
        if (newRefreshToken) setItem('refresh_token', newRefreshToken);

        if (token && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return api(originalRequest);
      } catch {
        removeItem('access_token');
        removeItem('refresh_token');
        removeItem('device_id');
        removeItem('branch_id');
        removeItem('tenant_id');
        removeItem('api_key');
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
