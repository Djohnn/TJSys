export interface DeviceConfig {
  id: string;
  name: string;
  branchId: string;
  apiKey: string;
  token: string | null;
  tokenExpiresAt: Date | null;
}

export interface CachedProduct {
  id: string;
  sku: string;
  name: string;
  baseUnitId: string;
  requiresLot: boolean;
  requiresExpiry: boolean;
  isActive: boolean;
  price: Decimal;
  priceUpdatedAt: Date;
}

export interface CashSessionState {
  sessionId: string | null;
  status: 'closed' | 'open';
  openingAmount: Decimal;
  expectedAmount: Decimal;
  salesCount: number;
  totalSales: Decimal;
}

export interface SaleItemInput {
  product: string;
  unit: string;
  quantity: string;
  factor: string;
  discountAmount?: string;
}

export interface SalePaymentInput {
  method: string;
  amount: string;
  reference?: string;
}

export interface CounterSaleInput {
  branch: string;
  stockLocation: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
}

export type Decimal = string;

export interface Product {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
  requiresLot: boolean;
  requiresExpiry: boolean;
}

export interface Unit {
  id: string;
  symbol: string;
  name: string;
}

export interface ProductPrice {
  id: string;
  amount: string;
  validFrom: string;
  validTo: string | null;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface CashSession {
  id: string;
  branch: Branch;
  operator: string;
  status: 'open' | 'closed';
  openingAmount: string;
  expectedAmount: string;
  closingAmount: string | null;
  openedAt: string;
  closedAt: string | null;
}

export interface Sale {
  id: string;
  branch: Branch;
  cashSession: string;
  operator: string;
  status: 'confirmed' | 'cancelled';
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  product: Product | string;
  quantity: string;
  unit: Unit;
  factor: string;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
}

export interface SalePayment {
  id: string;
  method: string;
  amount: string;
  reference: string;
}

export interface CashMovement {
  id: string;
  movementType: string;
  amount: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  createdAt: string;
}

export interface CashSessionDetail extends CashSession {
  movements: CashMovement[];
  salesCount: number;
  totalSales: string;
  totalReserved: string;
  totalAvailable: string;
}

export interface SaleDetail extends Sale {
  items: SaleItem[];
  payments: SalePayment[];
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'completed' | 'error';
  pendingCount: number;
  lastSyncAt: string | null;
  error: string | null;
}

export interface ConnectivityState {
  isOnline: boolean;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  lastSyncAt: string | null;
}

export interface JournalEntry {
  id: number;
  uuid: string;
  type: 'sale:create' | 'cash-session:open' | 'cash-session:close';
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | 'failed';
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  last_error: string | null;
}
