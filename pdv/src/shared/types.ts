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
  base_unit: string;
  requires_lot: boolean;
  requires_expiry: boolean;
  unit_symbol?: string;
  unit_precision?: number;
}

export interface Unit {
  id: string;
  symbol: string;
  name: string;
}

export interface ProductPrice {
  id: string;
  amount: string;
  valid_from: string;
  valid_to: string | null;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface CashSession {
  id: string;
  branch: string;
  operator: string;
  status: 'open' | 'closed';
  opening_amount: string;
  expected_amount: string;
  closing_amount: string | null;
  opened_at: string;
  closed_at: string | null;
  sales_count?: number;
  total_sales?: string;
}

export interface Sale {
  id: string;
  branch: string;
  cash_session: string;
  operator: string;
  customer?: string | null;
  status: 'confirmed' | 'cancelled';
  gross_total: string;
  discount_total: string;
  net_total: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  product: Product | string;
  quantity: string;
  unit: Unit | string;
  unit_symbol?: string;
  unit_precision?: number;
  factor: string;
  unit_price: string;
  discount_amount: string;
  line_total: string;
}

export interface SalePayment {
  id: string;
  method: string;
  amount: string;
  reference: string;
}

export interface CashMovement {
  id: string;
  movement_type: string;
  amount: string;
  payment_method: string;
  reference: string;
  notes: string;
  created_at: string;
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
