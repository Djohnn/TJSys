import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiUrl, normalizeApiBaseUrl } from '../../shared/apiUrl';

const API_BASE_URL = normalizeApiBaseUrl('/api/v1/');

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const tid = localStorage.getItem('tenant_id');
    if (tid) {
      config.headers['X-Tenant-ID'] = tid;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await fetch(apiUrl(API_BASE_URL, '/devices/refresh/'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) throw new Error('Refresh failed');

        const data = await response.json();
        if (
          typeof data.token !== 'string' ||
          data.token.trim().length === 0 ||
          typeof data.refresh_token !== 'string' ||
          data.refresh_token.trim().length === 0
        ) {
          throw new Error('Invalid refresh response');
        }
        localStorage.setItem('access_token', data.token);
        localStorage.setItem('refresh_token', data.refresh_token);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.token}`;
        }
        return api(originalRequest);
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('device_id');
        localStorage.removeItem('branch_id');
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('api_key');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export { api };
