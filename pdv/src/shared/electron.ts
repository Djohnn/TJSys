import type {
  Branch,
  CachedProduct,
  CashMovement,
  CashSession,
  ConnectivityState,
  JournalEntry,
  Product,
  ProductPrice,
  Sale,
  SaleDetail,
  SyncState,
  Unit,
} from './types';

export type ElectronResult<T> =
  | ({ success: true; error?: string } & ([T] extends [void] ? { data?: T } : { data: T }))
  | { success: false; data?: T | null; error?: string };

export interface AuthTokenSyncInput {
  token: string;
  refresh_token: string;
  device_id: string;
  branch_id?: string | null;
  tenant_id?: string;
  api_key: string;
}

export interface DeviceTokenResponse {
  token: string;
  refresh_token: string;
  device_id: string;
  tenant_id: string;
  branch_id: string | null;
}

export interface RegisterDeviceInput {
  name: string;
  branch: string;
  platform?: string;
  appVersion?: string;
  osVersion?: string;
}

export interface DeviceInfo {
  name: string;
  branch: string;
}

export interface CashSessionOpenInput {
  branch: string;
  openingAmount: string;
}

export interface CashSessionCloseInput {
  sessionId: string;
  closingAmount: string;
}

export interface SaleInput {
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
}

export interface PrintReceiptInput {
  html: string;
  fileName: string;
}

export interface ProductPriceInput {
  productId: string;
  branchId?: string;
}

export interface ProductCachePriceInput {
  productId: string;
  at?: string;
}

export interface ElectronAPI {
  // Auth
  login(apiKey: string): Promise<ElectronResult<DeviceTokenResponse>>;
  syncAuthTokens(data: AuthTokenSyncInput): Promise<ElectronResult<void>>;
  logout(): Promise<ElectronResult<void>>;
  checkAuth(): Promise<ElectronResult<{ isAuthenticated: boolean }>>;
  refreshToken(): Promise<ElectronResult<DeviceTokenResponse>>;

  // Device
  registerDevice(data: RegisterDeviceInput): Promise<ElectronResult<{ device_id: string }>>;
  validateDevice(apiKey: string): Promise<ElectronResult<DeviceTokenResponse>>;
  refreshDeviceToken(): Promise<ElectronResult<DeviceTokenResponse>>;
  getDeviceInfo(): Promise<ElectronResult<DeviceInfo | null>>;

  // Cash Session
  openCashSession(data: CashSessionOpenInput): Promise<ElectronResult<{ id: string; status: string }>>;
  getCurrentCashSession(branchId: string): Promise<ElectronResult<CashSession | null>>;
  closeCashSession(data: CashSessionCloseInput): Promise<ElectronResult<{ status: string }>>;
  listCashSessions(params?: { branch?: string }): Promise<ElectronResult<CashSession[]>>;
  getCashMovements(sessionId: string): Promise<ElectronResult<CashMovement[]>>;

  // Sales
  createSale(data: SaleInput): Promise<ElectronResult<Sale>>;
  listSales(params?: { branch?: string; limit?: number; offset?: number }): Promise<ElectronResult<Sale[]>>;
  getSaleDetail(saleId: string): Promise<ElectronResult<SaleDetail>>;
  printReceipt(data: PrintReceiptInput): Promise<ElectronResult<void>>;
  printFiscalReceipt(data: PrintReceiptInput): Promise<ElectronResult<void>>;
  printBalcaoReceipt(data: PrintReceiptInput): Promise<ElectronResult<void>>;

  // Catalog
  searchProducts(query: string): Promise<ElectronResult<Product[]>>;
  getProduct(productId: string): Promise<ElectronResult<Pick<Product, 'id' | 'name'> | null>>;
  getProductPrice(data: ProductPriceInput): Promise<ElectronResult<{ amount: string }>>;
  listUnits(): Promise<ElectronResult<Unit[]>>;
  listProducts(params?: { search?: string; page?: number }): Promise<ElectronResult<Product[]>>;
  getProductPrices(productId: string): Promise<ElectronResult<ProductPrice[]>>;

  // Branch
  listBranches(): Promise<ElectronResult<Branch[]>>;

  // Connectivity
  getConnectivityStatus(): Promise<ElectronResult<ConnectivityState>>;
  checkConnectivity(): Promise<ElectronResult<Pick<ConnectivityState, 'isOnline'>>>;

  // Sync
  getSyncStatus(): Promise<ElectronResult<SyncState>>;
  startSync(): Promise<ElectronResult<SyncState>>;
  getPendingOperations(): Promise<ElectronResult<{ count: number; operations: unknown[] }>>;
  getJournal(): Promise<ElectronResult<JournalEntry[]>>;

  // Catalog cache is exposed by the Electron preload bridge.
  catalogSync(): Promise<ElectronResult<{ products: number; prices: number }>>;
  searchProductsCache(query: string): Promise<ElectronResult<CachedProduct[]>>;
  getProductCache(productId: string): Promise<ElectronResult<CachedProduct | null>>;
  getProductBySkuCache(sku: string): Promise<ElectronResult<CachedProduct | null>>;
  getProductPriceCache(data: ProductCachePriceInput): Promise<ElectronResult<ProductPrice | null>>;
}

export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined;
};

export const isDev = (): boolean => {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
};

const mockElectronAPI: ElectronAPI = {
  // Auth
  login: async (_apiKey) => ({
    success: true,
    data: {
      token: 'mock-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device',
      tenant_id: 'mock-tenant',
      branch_id: null,
    },
  }),
  syncAuthTokens: async (_data) => ({ success: true, data: undefined }),
  logout: async () => ({ success: true, data: undefined }),
  checkAuth: async () => ({ success: true, data: { isAuthenticated: true } }),
  refreshToken: async () => ({
    success: true,
    data: {
      token: 'mock-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device',
      tenant_id: 'mock-tenant',
      branch_id: null,
    },
  }),

  // Device
  registerDevice: async (_data) => ({ success: true, data: { device_id: 'mock-device' } }),
  validateDevice: async (_apiKey) => ({
    success: true,
    data: {
      token: 'mock-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device',
      tenant_id: 'mock-tenant',
      branch_id: null,
    },
  }),
  refreshDeviceToken: async () => ({
    success: true,
    data: {
      token: 'mock-token',
      refresh_token: 'mock-refresh-token',
      device_id: 'mock-device',
      tenant_id: 'mock-tenant',
      branch_id: null,
    },
  }),
  getDeviceInfo: async () => ({ success: true, data: { name: 'Mock Device', branch: 'Mock Branch' } }),

  // Cash Session
  openCashSession: async (_data) => ({ success: true, data: { id: 'mock-session', status: 'open' } }),
  getCurrentCashSession: async (_branchId) => ({ success: true, data: null }),
  closeCashSession: async (_data) => ({ success: true, data: { status: 'closed' } }),
  listCashSessions: async (_params) => ({ success: true, data: [] }),
  getCashMovements: async (_sessionId) => ({ success: true, data: [] }),

  // Sales
  createSale: async (_data) => ({
    success: true,
    data: {
      id: 'mock-sale',
      branch: { id: 'mock-branch', name: 'Mock Branch', code: 'MOCK' },
      cashSession: 'mock-session',
      operator: 'mock',
      status: 'confirmed',
      grossTotal: '0.00',
      discountTotal: '0.00',
      netTotal: '0.00',
      createdAt: new Date().toISOString(),
    },
  }),
  listSales: async (_params) => ({ success: true, data: [] }),
  getSaleDetail: async (saleId) => ({
    success: true,
    data: {
      id: saleId,
      branch: { id: 'mock-branch', name: 'Mock Branch', code: 'MOCK' },
      cashSession: 'mock-session',
      operator: 'mock',
      status: 'confirmed',
      grossTotal: '0.00',
      discountTotal: '0.00',
      netTotal: '0.00',
      createdAt: new Date().toISOString(),
      items: [],
      payments: [],
    },
  }),
  printReceipt: async (_data) => ({ success: true, data: undefined }),
  printFiscalReceipt: async (_data) => ({ success: true, data: undefined }),
  printBalcaoReceipt: async (_data) => ({ success: true, data: undefined }),

  // Catalog
  searchProducts: async (_query) => ({ success: true, data: [] }),
  getProduct: async (_productId) => ({ success: true, data: null }),
  getProductPrice: async (_data) => ({ success: true, data: { amount: '0.00' } }),
  listUnits: async () => ({ success: true, data: [] }),
  listProducts: async (_params) => ({ success: true, data: [] }),
  getProductPrices: async (_productId) => ({ success: true, data: [] }),

  // Branch
  listBranches: async () => ({ success: true, data: [] }),

  // Connectivity
  getConnectivityStatus: async () => ({
    success: true,
    data: { isOnline: true, lastOnlineAt: new Date().toISOString(), lastOfflineAt: null, lastSyncAt: null },
  }),
  checkConnectivity: async () => ({ success: true, data: { isOnline: true } }),

  // Sync
  getSyncStatus: async () => ({
    success: true,
    data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null },
  }),
  startSync: async () => ({
    success: true,
    data: { status: 'idle', pendingCount: 0, lastSyncAt: new Date().toISOString(), error: null },
  }),
  getPendingOperations: async () => ({ success: true, data: { count: 0, operations: [] } }),
  getJournal: async () => ({ success: true, data: [] }),

  // Catalog cache
  catalogSync: async () => ({ success: true, data: { products: 0, prices: 0 } }),
  searchProductsCache: async (_query) => ({ success: true, data: [] }),
  getProductCache: async (_productId) => ({ success: true, data: null }),
  getProductBySkuCache: async (_sku) => ({ success: true, data: null }),
  getProductPriceCache: async (_data) => ({ success: true, data: null }),
};

export const getElectronAPI = (): ElectronAPI => {
  if (isElectron()) {
    return window.electronAPI;
  }

  // Mock API for browser/non-Electron environment
  return mockElectronAPI;
};

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Initialize the mock if not in Electron
if (typeof window !== 'undefined' && !isElectron()) {
  window.electronAPI = getElectronAPI();
}

export {};
