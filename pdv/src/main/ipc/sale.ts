import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { api } from '../services/api';
import { connectivityMonitor } from '../services/connectivityMonitor';
import { contingencyPolicy } from '../services/contingencyPolicy';
import { offlineSaleService } from '../services/offlineSaleService';
import { logger } from '../utils/logger';

export function setupSaleHandlers() {
  ipcMain.handle('sale:create', async (event: IpcMainInvokeEvent, data: {
    branch: string;
    stock_location: string;
    cash_session_id?: string;
    operator_id?: string;
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
      contingencyPolicy.recordOnlineHeartbeat(extractServerTime(res.headers?.date, res.data));
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
      if (!err.response && !connectivityMonitor.isOnline()) {
        try {
          const queued = offlineSaleService.queueSale(data);
          return {
            success: true,
            data: {
              id: queued.entry.uuid,
              offline: true,
              pending_sync: true,
              status: queued.entry.status,
              total_amount: queued.payload.total_amount,
              change_amount: queued.payload.change_amount,
              local_sequence: queued.payload.local_sequence,
            },
          };
        } catch (offlineError) {
          return {
            success: false,
            error: offlineError instanceof Error ? offlineError.message : 'Offline contingency blocked this sale',
            code: 'offline_contingency_blocked',
          };
        }
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

  ipcMain.handle('sale:receipt', async (event: IpcMainInvokeEvent, saleId: string) => {
    try {
      const res = await api.get(`/sales/${saleId}/receipt/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get receipt:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get receipt' };
    }
  });
}

function extractServerTime(headerDate: unknown, payload: unknown): string | null {
  if (typeof headerDate === 'string' && headerDate.trim()) return headerDate;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const serverTime = (payload as { server_time?: unknown }).server_time;
    if (typeof serverTime === 'string' && serverTime.trim()) return serverTime;
  }
  return null;
}
