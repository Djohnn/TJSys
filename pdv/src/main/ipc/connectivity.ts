import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { connectivityMonitor } from '../services/connectivityMonitor';
import { logger } from '../utils/logger';

export function setupConnectivityHandlers() {
  ipcMain.handle('connectivity:status', async () => {
    return { success: true, data: connectivityMonitor.getState() };
  });

  ipcMain.handle('connectivity:check', async () => {
    try {
      const online = await connectivityMonitor.forceCheck();
      return { success: true, data: { isOnline: online } };
    } catch (error) {
      logger.error('Connectivity check failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Check failed' };
    }
  });
}
