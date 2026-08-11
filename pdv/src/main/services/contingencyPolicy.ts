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
  device: ContingencyEligibilitySnapshot;
  operator: ContingencyEligibilitySnapshot | null;
}

export interface ContingencyEligibilitySnapshot {
  id: string;
  active: boolean;
  revoked: boolean;
  validated_at: string;
  expires_at: string;
}

export interface ContingencyHeartbeatInput {
  operator_id?: string | null;
  operator_active?: boolean;
  operator_revoked?: boolean;
  device_id?: string | null;
  device_active?: boolean;
  device_revoked?: boolean;
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
    | 'device_not_eligible'
    | 'operator_not_eligible'
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

  recordOnlineHeartbeat(serverTime: string | Date | null | undefined, heartbeat: ContingencyHeartbeatInput = {}): boolean {
    const parsed = this.parseServerTime(serverTime);
    if (!parsed) return false;

    const observedAt = this.now().toISOString();
    const previousAnchor = this.getAnchor();
    const deviceId = heartbeat.device_id ?? this.auth.getDeviceId();
    if (!deviceId) return false;

    const deviceEligibility: ContingencyEligibilitySnapshot = {
      id: deviceId,
      active: heartbeat.device_active ?? true,
      revoked: heartbeat.device_revoked ?? false,
      validated_at: parsed,
      expires_at: new Date(Date.parse(parsed) + OFFLINE_WINDOW_MS).toISOString(),
    };

    const operatorEligibility = this.buildOperatorEligibility(parsed, heartbeat, previousAnchor);
    const anchor: ContingencyAnchor = {
      server_time: parsed,
      client_wall_time: observedAt,
      last_online_at: parsed,
      monotonic_ms: this.monotonicNow(),
      session_id: this.sessionId,
      device: deviceEligibility,
      operator: operatorEligibility,
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
        typeof parsed.session_id !== 'string' ||
        !this.isEligibilitySnapshot(parsed.device) ||
        (parsed.operator !== null && parsed.operator !== undefined && !this.isEligibilitySnapshot(parsed.operator))
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

    const monotonicNowMs = this.monotonicNow();
    if (!Number.isFinite(monotonicNowMs) || monotonicNowMs < anchor.monotonic_ms) {
      return this.block('clock_rollback_detected', 'Monotonic clock regression detected; offline contingency is fail-closed');
    }

    const monotonicElapsedMs = monotonicNowMs - anchor.monotonic_ms;
    if (monotonicElapsedMs > OFFLINE_WINDOW_MS) {
      return this.block('offline_window_exceeded', 'Offline contingency exceeded the two-hour window');
    }

    const projectedNowMs = Date.parse(anchor.server_time) + monotonicElapsedMs;
    if (!Number.isFinite(projectedNowMs)) {
      return this.block('restart_requires_new_anchor', 'Offline contingency anchor is invalid after restart; reconnect first');
    }

    if (!this.isEligibilityValid(anchor.device, projectedNowMs, this.auth.getDeviceId())) {
      return this.block('device_not_eligible', 'Device eligibility is missing, expired, inactive, revoked, or mismatched for offline contingency');
    }

    if (!this.isEligibilityValid(anchor.operator, projectedNowMs, input.operator_id)) {
      return this.block('operator_not_eligible', 'Operator eligibility is missing, expired, inactive, revoked, or mismatched for offline contingency');
    }

    const projectedNow = new Date(projectedNowMs);
    const saleTotalCents = this.calculateSaleTotal(input.items, projectedNow, projectedNowMs);
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
    projectedNow: Date,
    projectedNowMs: number,
  ): { ok: true; totalCents: number } | { ok: false; error: BlockedSale } {
    let totalCents = 0;
    for (const item of items) {
      const product = this.catalogCache.getProductById(item.product);
      if (!product) {
        return { ok: false, error: this.block('missing_cached_product', `Product ${item.product} is not cached locally`) };
      }
      const price = this.catalogCache.getPrice(item.product, projectedNow);
      if (!price) {
        return { ok: false, error: this.block('missing_cached_price', `Product ${item.product} has no valid cached price`) };
      }
      const updatedMs = Date.parse(price.updated_at);
      if (!Number.isFinite(updatedMs) || projectedNowMs - updatedMs > PRICE_CACHE_MAX_AGE_MS) {
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

  private buildOperatorEligibility(
    serverTimeIso: string,
    heartbeat: ContingencyHeartbeatInput,
  ): ContingencyEligibilitySnapshot | null {
    const operatorId = heartbeat.operator_id?.trim();
    if (operatorId) {
      return {
        id: operatorId,
        active: heartbeat.operator_active ?? true,
        revoked: heartbeat.operator_revoked ?? false,
        validated_at: serverTimeIso,
        expires_at: new Date(Date.parse(serverTimeIso) + OFFLINE_WINDOW_MS).toISOString(),
      };
    }
    return null;
  }

  private isEligibilitySnapshot(value: unknown): value is ContingencyEligibilitySnapshot {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value as Partial<ContingencyEligibilitySnapshot>;
    return typeof snapshot.id === 'string'
      && typeof snapshot.active === 'boolean'
      && typeof snapshot.revoked === 'boolean'
      && typeof snapshot.validated_at === 'string'
      && typeof snapshot.expires_at === 'string';
  }

  private isEligibilityValid(
    snapshot: ContingencyEligibilitySnapshot | null,
    projectedNowMs: number,
    expectedId: string | null | undefined,
  ): boolean {
    if (!snapshot || !expectedId || snapshot.id !== expectedId) return false;
    if (!snapshot.active || snapshot.revoked) return false;

    const expiresAtMs = Date.parse(snapshot.expires_at);
    if (!Number.isFinite(expiresAtMs) || projectedNowMs > expiresAtMs) return false;
    return true;
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
