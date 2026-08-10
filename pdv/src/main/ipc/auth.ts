import { ipcMain } from 'electron';
import { auth } from '../services/auth';
import { setItem } from '../utils/storage';
import { logger } from '../utils/logger';
import type { ElectronResult } from '../../shared/electron';

export function setupAuthHandlers() {
  ipcMain.handle('auth:login', async (_event, apiKey: string) => {
    logger.info('Attempting login with API key');
    try {
      const result = await auth.validateApiKey(apiKey);
      return { success: true, data: result };
    } catch (error) {
      logger.error('Login failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Invalid API key' };
    }
  });

  ipcMain.handle('auth:sync-tokens', async (_event, data: {
    token: string;
    refresh_token: string;
    device_id: string;
    branch_id?: string;
    tenant_id?: string;
    api_key: string;
  }) => {
    setItem('access_token', data.token);
    setItem('refresh_token', data.refresh_token);
    setItem('device_id', data.device_id);
    setItem('branch_id', data.branch_id ?? '');
    setItem('tenant_id', data.tenant_id ?? '');
    setItem('api_key', data.api_key);
    return { success: true };
  });

  ipcMain.handle('auth:logout', async () => {
    auth.clearAuth();
    return { success: true };
  });

  ipcMain.handle('auth:check', async (): Promise<ElectronResult<{ isAuthenticated: boolean }>> => ({
    success: true,
    data: { isAuthenticated: auth.isAuthenticated() },
  }));

  ipcMain.handle('auth:refresh', async () => {
    try {
      const result = await auth.refreshToken();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh token' };
    }
  });
}
