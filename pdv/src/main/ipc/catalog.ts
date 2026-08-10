import { ipcMain } from 'electron';
import { api } from '../services/api';
import { logger } from '../utils/logger';
import type { ElectronResult, ProductPriceInput } from '../../shared/electron';
import type { Product, ProductPrice, Unit } from '../../shared/types';
import { unwrapResults, type PaginatedResponse } from './response';

export function setupCatalogHandlers() {
  ipcMain.handle('catalog:search-products', async (
    _event,
    query: string,
  ): Promise<ElectronResult<Product[]>> => {
    logger.info('Searching products', { query });
    try {
      const res = await api.get<Product[] | PaginatedResponse<Product>>('/products/', {
        params: { search: query },
      });
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to search products:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search products' };
    }
  });

  ipcMain.handle('catalog:get-product', async (
    _event,
    productId: string,
  ): Promise<ElectronResult<Product | null>> => {
    try {
      const res = await api.get(`/products/${productId}/`);
      return { success: true, data: res.data };
    } catch (error) {
      logger.error('Failed to get product:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  });

  ipcMain.handle('catalog:get-price', async (
    _event,
    data: ProductPriceInput,
  ): Promise<ElectronResult<ProductPrice | null>> => {
    try {
      const res = await api.get<ProductPrice[] | PaginatedResponse<ProductPrice>>(`/products/${data.productId}/prices/`, {
        params: { branch: data.branchId },
      });
      return { success: true, data: unwrapResults(res.data)[0] ?? null };
    } catch (error) {
      logger.error('Failed to get price:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get price' };
    }
  });

  ipcMain.handle('catalog:list-units', async (): Promise<ElectronResult<Unit[]>> => {
    try {
      const res = await api.get<Unit[] | PaginatedResponse<Unit>>('/units/');
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to list units:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list units' };
    }
  });

  ipcMain.handle('catalog:products', async (
    _event,
    params?: { search?: string; page?: number },
  ): Promise<ElectronResult<Product[]>> => {
    try {
      const res = await api.get<Product[] | PaginatedResponse<Product>>('/products/', { params });
      return { success: true, data: unwrapResults(res.data) };
    } catch (error) {
      logger.error('Failed to list products:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list products' };
    }
  });
}
