import { ipcMain } from 'electron';
import { catalogCache } from '../services/catalogCache';
import { logger } from '../utils/logger';

export function setupCatalogCacheHandlers() {
  ipcMain.handle('catalog-cache:search', async (_event, query: string) => {
    logger.info('Searching catalog cache', { query });
    try {
      const results = catalogCache.searchProducts(query);
      return { success: true, data: results };
    } catch (error) {
      logger.error('Failed to search catalog cache:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search catalog' };
    }
  });

  ipcMain.handle('catalog-cache:get-product', async (_event, productId: string) => {
    try {
      const product = catalogCache.getProductById(productId);
      return { success: true, data: product };
    } catch (error) {
      logger.error('Failed to get product from cache:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  });

  ipcMain.handle('catalog-cache:get-product-by-sku', async (_event, sku: string) => {
    try {
      const product = catalogCache.getProductBySku(sku);
      return { success: true, data: product };
    } catch (error) {
      logger.error('Failed to get product by SKU from cache:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get product' };
    }
  });

  ipcMain.handle('catalog-cache:get-price', async (_event, data: { productId: string; at?: string }) => {
    try {
      const at = data.at ? new Date(data.at) : new Date();
      const price = catalogCache.getPrice(data.productId, at);
      return { success: true, data: price };
    } catch (error) {
      logger.error('Failed to get price from cache:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get price' };
    }
  });

  ipcMain.handle('catalog-cache:sync', async () => {
    logger.info('Syncing catalog cache from backend');
    try {
      const result = await catalogCache.syncFromBackend();
      logger.info('Catalog sync completed', result);
      return { success: true, data: result };
    } catch (error) {
      logger.error('Failed to sync catalog cache:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to sync catalog' };
    }
  });

  ipcMain.handle('catalog-cache:last-sync', async () => {
    const lastSync = catalogCache.getLastSync();
    return { success: true, data: lastSync };
  });
}
