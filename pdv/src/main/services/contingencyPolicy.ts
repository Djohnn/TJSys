import { performance } from 'node:perf_hooks';
import { auth } from './auth';
import { catalogCache, type CachedPrice, type CachedProduct } from './catalogCache';
import { getItem, setItem } from '../utils/storage';

const CONTINGENCY_ANCHOR_KEY = 'offline_contingency_anchor';
const OFFLINE_WINDOW_MS = 2 * 60 * 60 * 1000;
const PRICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface ContingencySaleItem {
  product: string;
  unit: string;
  quantity: string;
  factor: string;
  discount_amount?: string;
}

export interface ContingencySalePayment {
  method: string;
  amount: string;
  reference?: string;
}

export interface ContingencySaleInput {
  branch: string;
  stock_location: string;
  cash_session_id?: string;
  operator_id?: string;
  items: ContingencySaleItem[];
  payments: ContingencySalePayment[];
}

export interface ContingencyAnchor {
  server_time: string;
  client_wall_time: string;
  last_online_at: string;
  monotonic_ms: number;
  session_id: string;
}

type AllowedSale = {
  allowed: true;
  anchor: ContingencyAnchor;
  totalAmount: string;
  changeAmount: string;
};

type BlockedSale = {
  allowed: false;
  code:
    | 'missing_anchor'
    | 'device_not_authenticated'
    | 'missing_tenant'
    | 'missing_cash_session'
    | 'missing_operator'
    | 'clock_rollback_detected'
    | 'restart_requires_new_anchor'
    | 'offline_window_exceeded'
    | 'missing_cached_product'
    | 'stale_price_cache'
    | 'missing_cached_price'
    | 'invalid_payment_method'
    | 'payment_amount_invalid'
    | 'external_reference_required'
    | 'external_payment_mismatch'
    | 'insufficient_payment';
  reason: string;
};

export type OfflineSaleEvaluation = AllowedSale | BlockedSale;

interface AuthLike {
  isAuthenticated(): boolean;
  getDeviceId(): string | null;
  getBranchId(): string | null;
  getRefreshToken(): string | null;
}

interface CatalogCacheLike {
  getProductById(id: string): CachedProduct | null;
  getPrice(productId: string, at?: Date): CachedPrice | null;
}

interface ContingencyPolicyDeps {
  sessionId?: string;
  now?: () => Date;
  monotonicNow?: () => number;
  auth?: AuthLike;
  catalogCache?: CatalogCacheLike;
  getTenantId?: () => string | null;
}

export class ContingencyPolicy {
  private readonly sessionId: string;
  private readonly now: () => Date;
  private readonly monotonicNow: () => number;
  private readonly auth: AuthLike;
  private readonly catalogCache: CatalogCacheLike;
  private readonly getTenantId: () => string | null;

  constructor(deps: ContingencyPolicyDeps = {}) {
    this.sessionId = deps.sessionId ?? crypto.randomUUID();
    this.now = deps.now ?? (() => new Date());
    this.monotonicNow = deps.monotonicNow ?? (() => performance.now());
    this.auth = deps.auth ?? auth;
    this.catalogCache = deps.catalogCache ?? catalogCache;
    this.getTenantId = deps.getTenantId ?? (() => getItem('tenant_id'));
  }

  recordOnlineHeartbeat(serverTime: string | Date | null | undefined): boolean {
    const parsed = this.parseServerTime(serverTime);
    if (!parsed) return false;

    const observedAt = this.now().toISOString();
    const anchor: ContingencyAnchor = {
      server_time: parsed,
      client_wall_time: observedAt,
      last_online_at: parsed,
      monotonic_ms: this.monotonicNow(),
      session_id: this.sessionId,
    };
    setItem(CONTINGENCY_ANCHOR_KEY, JSON.stringify(anchor));
    return true;
  }

  getAnchor(): ContingencyAnchor | null {
    const raw = getItem(CONTINGENCY_ANCHOR_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ContingencyAnchor>;
      if (
        typeof parsed.server_time !== 'string' ||
        typeof parsed.client_wall_time !== 'string' ||
        typeof parsed.last_online_at !== 'string' ||
        typeof parsed.monotonic_ms !== 'number' ||
        typeof parsed.session_id !== 'string'
      ) {
        return null;
      }
      return parsed as ContingencyAnchor;
    } catch {
      return null;
    }
  }

  evaluateOfflineSale(input: ContingencySaleInput): OfflineSaleEvaluation {
    if (!this.auth.isAuthenticated() || !this.auth.getDeviceId() || !this.auth.getRefreshToken()) {
      return this.block('device_not_authenticated', 'Authenticated device session is required for offline contingency');
    }

    if (!this.getTenantId()) {
      return this.block('missing_tenant', 'Tenant context is required for offline contingency');
    }

    if (!input.cash_session_id) {
      return this.block('missing_cash_session', 'Cash session must already be open before going offline');
    }

    if (!input.operator_id) {
      return this.block('missing_operator', 'Authenticated operator is required for offline contingency');
    }

    const anchor = this.getAnchor();
    if (!anchor) {
      return this.block('missing_anchor', 'Missing backend anchor for offline contingency');
    }

    const now = this.now();
    const wallNowMs = now.getTime();
    const anchorWallMs = Date.parse(anchor.client_wall_time);
    if (!Number.isFinite(anchorWallMs) || wallNowMs < anchorWallMs) {
      return this.block('clock_rollback_detected', 'Local clock rollback detected; offline contingency is fail-closed');
    }

    if (anchor.session_id !== this.sessionId) {
      return this.block('restart_requires_new_anchor', 'Application restarted after last backend anchor; reconnect before new offline sales');
    }

    const anchorOnlineMs = Date.parse(anchor.last_online_at);
    if (!Number.isFinite(anchorOnlineMs) || wallNowMs - anchorOnlineMs > OFFLINE_WINDOW_MS) {
      return this.block('offline_window_exceeded', 'Offline contingency exceeded the two-hour window');
    }

    const saleTotalCents = this.calculateSaleTotal(input.items, now);
    if (!saleTotalCents.ok) return saleTotalCents.error;

    const paymentValidation = this.validatePayments(input.payments, saleTotalCents.totalCents);
    if (!paymentValidation.ok) return paymentValidation.error;

    return {
      allowed: true,
      anchor,
      totalAmount: centsToAmount(saleTotalCents.totalCents),
      changeAmount: centsToAmount(paymentValidation.changeCents),
    };
  }

  private calculateSaleTotal(
    items: ContingencySaleItem[],
    now: Date,
  ): { ok: true; totalCents: number } | { ok: false; error: BlockedSale } {
    let totalCents = 0;
    for (const item of items) {
      const product = this.catalogCache.getProductById(item.product);
      if (!product) {
        return { ok: false, error: this.block('missing_cached_product', `Product ${item.product} is not cached locally`) };
      }
      const price = this.catalogCache.getPrice(item.product, now);
      if (!price) {
        return { ok: false, error: this.block('missing_cached_price', `Product ${item.product} has no valid cached price`) };
      }
      const updatedMs = Date.parse(price.updated_at);
      if (!Number.isFinite(updatedMs) || now.getTime() - updatedMs > PRICE_CACHE_MAX_AGE_MS) {
        return { ok: false, error: this.block('stale_price_cache', `Product ${item.product} price cache is older than twenty-four hours`) };
      }

      const quantity = parseAmountToMilli(item.quantity);
      const factor = parseAmountToMilli(item.factor);
      const amountCents = amountToCents(price.amount);
      const discountCents = amountToCents(item.discount_amount ?? '0');
      const lineCents = Math.max(0, Math.round((quantity * factor * amountCents) / 1_000_000) - discountCents);
      totalCents += lineCents;
    }

    return { ok: true, totalCents };
  }

  private validatePayments(
    payments: ContingencySalePayment[],
    totalCents: number,
  ): { ok: true; changeCents: number } | { ok: false; error: BlockedSale } {
    let paidCents = 0;
    let cashCents = 0;
    let externalCents = 0;

    for (const payment of payments) {
      if (!['cash', 'card_external_confirmed', 'pix_external_confirmed'].includes(payment.method)) {
        return { ok: false, error: this.block('invalid_payment_method', `Offline payment method ${payment.method} is not allowed`) };
      }

      const amountCents = amountToCents(payment.amount);
      if (amountCents <= 0) {
        return { ok: false, error: this.block('payment_amount_invalid', 'Offline payments require a positive amount') };
      }

      if (payment.method === 'cash') {
        cashCents += amountCents;
      } else {
        externalCents += amountCents;
        if (!payment.reference?.trim()) {
          return { ok: false, error: this.block('external_reference_required', `${payment.method} requires audited external confirmation`) };
        }
      }

      paidCents += amountCents;
    }

    if (paidCents < totalCents) {
      return { ok: false, error: this.block('insufficient_payment', 'Offline payment total must fully cover the sale') };
    }

    if (cashCents === 0 && paidCents !== totalCents) {
      return { ok: false, error: this.block('external_payment_mismatch', 'External confirmed payments must match the sale total exactly') };
    }

    if (externalCents > totalCents) {
      return { ok: false, error: this.block('external_payment_mismatch', 'External confirmed payments cannot exceed the sale total') };
    }

    return { ok: true, changeCents: Math.max(0, paidCents - totalCents) };
  }

  private block(code: BlockedSale['code'], reason: string): BlockedSale {
    return { allowed: false, code, reason };
  }

  private parseServerTime(serverTime: string | Date | null | undefined): string | null {
    if (!serverTime) return null;
    const date = serverTime instanceof Date ? serverTime : new Date(serverTime);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
}

function amountToCents(value: string): number {
  return Math.round(Number(value) * 100);
}

function parseAmountToMilli(value: string): number {
  return Math.round(Number(value) * 1000);
}

function centsToAmount(value: number): string {
  return (value / 100).toFixed(2);
}

export const contingencyPolicy = new ContingencyPolicy();
