export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
};

export const isDev = (): boolean => {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
};

export const getElectronAPI = () => {
  if (isElectron()) {
    return (window as any).electronAPI;
  }
  
  // Mock API for browser/non-Electron environment
  return {
    // Auth
    login: async (apiKey: string) => ({ success: true, data: { token: 'mock-token', tenant_id: 'mock-tenant', branch_id: 'mock-branch' } }),
    syncAuthTokens: async (_data: any) => ({ success: true }),
    logout: async () => ({ success: true }),
    checkAuth: async () => ({ success: true, data: { isAuthenticated: true } }),
    refreshToken: async () => ({ success: true, data: { token: 'mock-token' } }),
    
    // Device
    registerDevice: async (data: any) => ({ success: true, data: { device_id: 'mock-device' } }),
    validateDevice: async (apiKey: string) => ({ success: true, data: { token: 'mock-token', tenant_id: 'mock-tenant', branch_id: 'mock-branch' } }),
    refreshDeviceToken: async () => ({ success: true }),
    getDeviceInfo: async () => ({ success: true, data: { name: 'Mock Device', branch: 'Mock Branch' } }),
    
    // Cash Session
    openCashSession: async (data: any) => ({ success: true, data: { id: 'mock-session', status: 'open' } }),
    getCurrentCashSession: async (branchId: string) => ({ success: true, data: null }),
    closeCashSession: async (data: any) => ({ success: true, data: { status: 'closed' } }),
    listCashSessions: async (params?: any) => ({ success: true, data: [] }),
    getCashMovements: async (sessionId: string) => ({ success: true, data: [] }),
    
    // Sales
    createSale: async (data: any) => ({ success: true, data: { id: 'mock-sale', net_total: '0.00' } }),
    listSales: async (params?: any) => ({ success: true, data: [] }),
    getSaleDetail: async (saleId: string) => ({ success: true, data: { id: saleId, items: [], net_total: '0.00' } }),
    printReceipt: async (data: any) => ({ success: true }),
    
    // Catalog
    searchProducts: async (query: string) => ({ success: true, data: [] }),
    getProduct: async (productId: string) => ({ success: true, data: null }),
    getProductPrice: async (data: any) => ({ success: true, data: { amount: '0.00' } }),
    listUnits: async () => ({ success: true, data: [] }),
    listProducts: async (params?: any) => ({ success: true, data: [] }),
    getProductPrices: async (productId: string) => ({ success: true, data: [] }),
    
    // Branch
    listBranches: async () => ({ success: true, data: [] }),
    
    // Connectivity
    getConnectivityStatus: async () => ({ 
      success: true, 
      data: { isOnline: true, lastOnlineAt: new Date().toISOString(), lastOfflineAt: null, lastSyncAt: null } 
    }),
    checkConnectivity: async () => ({ success: true, data: { isOnline: true } }),
    
    // Sync
    getSyncStatus: async () => ({ 
      success: true, 
      data: { status: 'idle', pendingCount: 0, lastSyncAt: null, error: null } 
    }),
    startSync: async () => ({ success: true, data: { status: 'idle', pendingCount: 0, lastSyncAt: new Date().toISOString(), error: null } }),
    getPendingOperations: async () => ({ success: true, data: { count: 0, operations: [] } }),
    getJournal: async () => ({ success: true, data: [] }),
  };
};

declare global {
  interface Window {
    electronAPI: ReturnType<typeof getElectronAPI>;
  }
}

// Initialize the mock if not in Electron
if (typeof window !== 'undefined' && !isElectron()) {
  (window as any).electronAPI = getElectronAPI();
}

export {};