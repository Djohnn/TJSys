import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/electron';

const electronAPI: ElectronAPI = {
  // Auth
  login: (apiKey: string) => ipcRenderer.invoke('auth:login', apiKey),
  syncAuthTokens: (data) => ipcRenderer.invoke('auth:sync-tokens', data),
  logout: () => ipcRenderer.invoke('auth:logout'),
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  refreshToken: () => ipcRenderer.invoke('auth:refresh'),

  // Device
  registerDevice: (data) => ipcRenderer.invoke('device:register', data),
  validateDevice: (apiKey: string) => ipcRenderer.invoke('device:validate', apiKey),
  refreshDeviceToken: () => ipcRenderer.invoke('device:refresh'),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),

  // Cash Session
  openCashSession: (data) => ipcRenderer.invoke('cash-session:open', data),
  getCurrentCashSession: (branchId: string) =>
    ipcRenderer.invoke('cash-session:current', branchId),
  closeCashSession: (data) => ipcRenderer.invoke('cash-session:close', data),
  listCashSessions: (params?: { branch?: string }) =>
    ipcRenderer.invoke('cash-session:list', params),
  getCashMovements: (sessionId: string) =>
    ipcRenderer.invoke('cash-session:movements', sessionId),

  // Sales
  createSale: (data) => ipcRenderer.invoke('sale:create', data),
  listSales: (params?: { branch?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('sale:list', params),
  getSaleDetail: (saleId: string) => ipcRenderer.invoke('sale:detail', saleId),
  getSaleReceipt: (saleId: string) => ipcRenderer.invoke('sale:receipt', saleId),
  printReceipt: (data) => ipcRenderer.invoke('printing:receipt', data),
  printFiscalReceipt: (data) => ipcRenderer.invoke('printing:fiscal', data),
  printBalcaoReceipt: (data) => ipcRenderer.invoke('printing:balcao', data),

  // Catalog
  searchProducts: (query: string) => ipcRenderer.invoke('catalog:search-products', query),
  getProduct: (productId: string) => ipcRenderer.invoke('catalog:get-product', productId),
  getProductPrice: (data) => ipcRenderer.invoke('catalog:get-price', data),
  listUnits: () => ipcRenderer.invoke('catalog:list-units'),
  listProducts: (params?: { search?: string; page?: number }) =>
    ipcRenderer.invoke('catalog:products', params),
  getProductPrices: (productId: string) => ipcRenderer.invoke('catalog:product-prices', productId),

  // Branch
  listBranches: () => ipcRenderer.invoke('branch:list'),

  // Connectivity
  getConnectivityStatus: () => ipcRenderer.invoke('connectivity:status'),
  checkConnectivity: () => ipcRenderer.invoke('connectivity:check'),

  // Sync
  getSyncStatus: () => ipcRenderer.invoke('sync:status'),
  startSync: () => ipcRenderer.invoke('sync:start'),
  getPendingOperations: () => ipcRenderer.invoke('sync:pending'),
  getJournal: () => ipcRenderer.invoke('sync:journal'),
  // Catalog cache
  catalogSync: () => ipcRenderer.invoke('catalog-cache:sync'),
  searchProductsCache: (query: string) => ipcRenderer.invoke('catalog-cache:search', query),
  getProductCache: (productId: string) => ipcRenderer.invoke('catalog-cache:get-product', productId),
  getProductBySkuCache: (sku: string) => ipcRenderer.invoke('catalog-cache:get-product-by-sku', sku),
  getProductPriceCache: (data) => ipcRenderer.invoke('catalog-cache:get-price', data),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
