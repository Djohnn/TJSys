import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import type { DeviceInfo, ElectronResult } from '../../shared/electron';

export function setupDeviceHandlers() {
  ipcMain.handle('device:register', async (_event, data: { name: string; branch: string; platform?: string; appVersion?: string; osVersion?: string }) => {
    logger.info('Registering device', { name: data.name });
    try {
      const res = await api.post('/devices/register/', data);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to register device:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to register device' };
    }
  });

  ipcMain.handle('device:validate', async (_event, apiKey: string) => {
    try {
      const res = await api.post('/devices/validate/', { api_key: apiKey });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to validate device:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to validate device' };
    }
  });

  ipcMain.handle('device:refresh', async () => {
    try {
      const res = await api.post('/devices/refresh/', {});
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to refresh device token:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh token' };
    }
  });

  ipcMain.handle('device:get-info', async (): Promise<ElectronResult<DeviceInfo | null>> => {
    // This would return local device info
    return { success: true, data: null };
  });
}
