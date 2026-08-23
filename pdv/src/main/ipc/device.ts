import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { api } from '../services/api';
import { auth } from '../services/auth';
import { logger } from '../utils/logger';
import type {
  DeviceInfo,
  DeviceTokenResponse,
  ElectronResult,
  RegisterDeviceInput,
} from '../../shared/electron';

export function setupDeviceHandlers(): void {
  ipcMain.handle('device:register', async (
    _event: IpcMainInvokeEvent,
    data: RegisterDeviceInput,
  ): Promise<ElectronResult<{ device_id: string }>> => {
    logger.info('Registering device', { name: data.name });
    try {
      const res = await api.post<{ device_id: string }>('/devices/register/', data);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to register device:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to register device' };
    }
  });

  ipcMain.handle('device:validate', async (
    _event: IpcMainInvokeEvent,
    apiKey: string,
  ): Promise<ElectronResult<DeviceTokenResponse>> => {
    try {
      const result = await auth.validateApiKey(apiKey);
      return { success: true, data: result };
    } catch (error) {
      logger.error('Failed to validate device:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to validate device' };
    }
  });

  ipcMain.handle('device:refresh', async (): Promise<ElectronResult<DeviceTokenResponse>> => {
    try {
      const result = await auth.refreshToken();
      return { success: true, data: result };
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
