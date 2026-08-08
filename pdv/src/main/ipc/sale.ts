import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';

export function setupSaleHandlers() {
  ipcMain.handle('sale:create', async (event: IpcMainInvokeEvent, data: {
    branch: string;
    stock_location: string;
    items: Array<{
      product: string;
      unit: string;
      quantity: string;
      factor: string;
      discount_amount?: string;
    }>;
    payments: Array<{
      method: string;
      amount: string;
      reference?: string;
    }>;
  }) => {
    logger.info('Creating counter sale', { branch: data.branch, itemsCount: data.items.length });
    try {
      const res = await api.post('/sales/counter/', data, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to create sale:', error);
      const err = error as { response?: { data?: { code?: string; detail?: string } } };
      if (err.response?.data?.code === 'payment_mismatch') {
        return { success: false, error: 'Payment total must match sale total', code: 'payment_mismatch' };
      }
      if (err.response?.data?.code === 'insufficient_stock') {
        return { success: false, error: 'Insufficient stock', code: 'insufficient_stock' };
      }
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create sale' };
    }
  });

  ipcMain.handle('sale:list', async (event: IpcMainInvokeEvent, params?: { branch?: string; limit?: number; offset?: number }) => {
    try {
      const res = await api.get('/sales/', { params });
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to list sales:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list sales' };
    }
  });

  ipcMain.handle('sale:detail', async (event: IpcMainInvokeEvent, saleId: string) => {
    try {
      const res = await api.get(`/sales/${saleId}/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get sale detail:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get sale detail' };
    }
  });
}