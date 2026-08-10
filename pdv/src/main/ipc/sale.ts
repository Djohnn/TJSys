import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import type { ElectronResult, SaleInput } from '../../shared/electron';
import type { Sale, SaleDetail } from '../../shared/types';
import { unwrapResults, type PaginatedResponse } from './response';

export function setupSaleHandlers() {
  ipcMain.handle('sale:create', async (
    _event,
    data: SaleInput,
  ): Promise<ElectronResult<Sale>> => {
    logger.info('Creating counter sale', { branch: data.branch, itemsCount: data.items.length });
    try {
      const res = await api.post<Sale>('/sales/counter/', data, {
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

  ipcMain.handle('sale:list', async (
    _event,
    params?: { branch?: string; limit?: number; offset?: number },
  ): Promise<ElectronResult<Sale[]>> => {
    try {
      const res = await api.get<Sale[] | PaginatedResponse<Sale>>('/sales/', { params });
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to list sales:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list sales' };
    }
  });

  ipcMain.handle('sale:detail', async (
    _event,
    saleId: string,
  ): Promise<ElectronResult<SaleDetail>> => {
    try {
      const res = await api.get<SaleDetail>(`/sales/${saleId}/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get sale detail:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get sale detail' };
    }
  });
}
