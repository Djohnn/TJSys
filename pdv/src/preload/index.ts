import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Auth
  login: (apiKey: string) => ipcRenderer.invoke('auth:login', apiKey),
  syncAuthTokens: (data: {
    token: string;
    refresh_token: string;
    device_id: string;
    branch_id?: string;
    tenant_id?: string;
    api_key: string;
  }) => ipcRenderer.invoke('auth:sync-tokens', data),
  logout: () => ipcRenderer.invoke('auth:logout'),
  checkAuth: () => ipcRenderer.invoke('auth:check'),
  refreshToken: () => ipcRenderer.invoke('auth:refresh'),

  // Device
  registerDevice: (data: { name: string; branch: string; platform?: string; appVersion?: string; osVersion?: string }) =>
    ipcRenderer.invoke('device:register', data),
  validateDevice: (apiKey: string) => ipcRenderer.invoke('device:validate', apiKey),
  refreshDeviceToken: () => ipcRenderer.invoke('device:refresh'),
  getDeviceInfo: () => ipcRenderer.invoke('device:get-info'),

  // Cash Session
  openCashSession: (data: { branch: string; openingAmount: string }) =>
    ipcRenderer.invoke('cash-session:open', data),
  getCurrentCashSession: (branchId: string) =>
    ipcRenderer.invoke('cash-session:current', branchId),
  closeCashSession: (data: { sessionId: string; closingAmount: string }) =>
    ipcRenderer.invoke('cash-session:close', data),
  listCashSessions: (params?: { branch?: string }) =>
    ipcRenderer.invoke('cash-session:list', params),
  getCashMovements: (sessionId: string) =>
    ipcRenderer.invoke('cash-session:movements', sessionId),

  // Sales
  createSale: (data: {
    branch: string;
    stock_location: string;
    items: Array<{ product: string; unit: string; quantity: string; factor: string; discount_amount?: string }>;
    payments: Array<{ method: string; amount: string; reference?: string }>;
  }) => ipcRenderer.invoke('sale:create', data),
  listSales: (params?: { branch?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('sale:list', params),
  getSaleDetail: (saleId: string) => ipcRenderer.invoke('sale:detail', saleId),
  printReceipt: (data: { html: string; fileName: string }) =>
    ipcRenderer.invoke('printing:receipt', data),
  printFiscalReceipt: (data: { html: string; fileName: string }) =>
    ipcRenderer.invoke('printing:fiscal', data),
  printBalcaoReceipt: (data: { html: string; fileName: string }) =>
    ipcRenderer.invoke('printing:balcao', data),

  // Catalog
  searchProducts: (query: string) => ipcRenderer.invoke('catalog:search-products', query),
  getProduct: (productId: string) => ipcRenderer.invoke('catalog:get-product', productId),
  getProductPrice: (data: { productId: string; branchId?: string }) =>
    ipcRenderer.invoke('catalog:get-price', data),
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
  getProductPriceCache: (data: { productId: string; at?: string }) => ipcRenderer.invoke('catalog-cache:get-price', data),
});
