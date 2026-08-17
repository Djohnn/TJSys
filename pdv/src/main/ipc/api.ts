import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import type { ElectronResult } from '../../shared/electron';
import type { Branch, ProductPrice } from '../../shared/types';
import { unwrapResults, type PaginatedResponse } from './response';

export function setupApiHandlers() {
  ipcMain.handle('catalog:product-prices', async (
    _event,
    productId: string,
  ): Promise<ElectronResult<ProductPrice[]>> => {
    try {
      const res = await api.get<ProductPrice[] | PaginatedResponse<ProductPrice>>(`/products/${productId}/prices/`);
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to get product prices:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product prices' };
    }
  });

  ipcMain.handle('branch:list', async (): Promise<ElectronResult<Branch[]>> => {
    try {
      const res = await api.get<Branch[] | PaginatedResponse<Branch>>('/branches/');
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to list branches:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list branches' };
    }
  });
}
