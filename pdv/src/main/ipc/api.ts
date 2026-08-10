import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';

export function setupApiHandlers() {
  ipcMain.handle('catalog:product-prices', async (_event, productId: string) => {
    try {
      const res = await api.get(`/products/${productId}/prices/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get product prices:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product prices' };
    }
  });

  ipcMain.handle('branch:list', async () => {
    try {
      const res = await api.get('/branches/');
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to list branches:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list branches' };
    }
  });
}
