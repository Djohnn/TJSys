import { getItem } from '../utils/storage';
import { contingencyPolicy, type ContingencyAnchor, type ContingencyPolicy, type ContingencySaleInput } from './contingencyPolicy';
import { auth } from './auth';
import { operationJournal, type JournalEntry } from './operationJournal';

export interface QueuedOfflineSalePayload extends ContingencySaleInput {
  branch_id: string;
  tenant_id: string;
  device_id: string;
  cash_session_id: string;
  operator_id: string;
  local_sequence: number;
  total_amount: string;
  change_amount: string;
  price_snapshot_at: string;
  offline_anchor: ContingencyAnchor;
  queued_at: string;
}

interface OperationJournalLike {
  getAll(): Array<Pick<JournalEntry, 'id' | 'status'>>;
  addOperation(op: { uuid: string; type: JournalEntry['type']; payload: Record<string, unknown>; idempotencyKey: string }): JournalEntry;
}

interface OfflineSaleServiceDeps {
  contingencyPolicy?: Pick<ContingencyPolicy, 'evaluateOfflineSale'>;
  auth?: Pick<typeof auth, 'getDeviceId' | 'getBranchId'>;
  getTenantId?: () => string | null;
  operationJournal?: OperationJournalLike;
  randomUUID?: () => string;
  nowIso?: () => string;
}

export class OfflineSaleService {
  private readonly contingencyPolicy: Pick<ContingencyPolicy, 'evaluateOfflineSale'>;
  private readonly auth: Pick<typeof auth, 'getDeviceId' | 'getBranchId'>;
  private readonly getTenantId: () => string | null;
  private readonly operationJournal: OperationJournalLike;
  private readonly randomUUID: () => string;
  private readonly nowIso: () => string;

  constructor(deps: OfflineSaleServiceDeps = {}) {
    this.contingencyPolicy = deps.contingencyPolicy ?? contingencyPolicy;
    this.auth = deps.auth ?? auth;
    this.getTenantId = deps.getTenantId ?? (() => getItem('tenant_id'));
    this.operationJournal = deps.operationJournal ?? operationJournal;
    this.randomUUID = deps.randomUUID ?? (() => crypto.randomUUID());
    this.nowIso = deps.nowIso ?? (() => new Date().toISOString());
  }

  queueSale(input: ContingencySaleInput): { entry: JournalEntry; payload: QueuedOfflineSalePayload } {
    const evaluation = this.contingencyPolicy.evaluateOfflineSale(input);
    if (!evaluation.allowed) {
      throw new Error(evaluation.reason);
    }

    const deviceId = this.auth.getDeviceId();
    const tenantId = this.getTenantId();
    const branchId = input.branch || this.auth.getBranchId();
    if (!deviceId || !tenantId || !branchId || !input.cash_session_id || !input.operator_id) {
      throw new Error('Offline sale identity is incomplete');
    }

    const localSequence = this.nextLocalSequence();
    const uuid = this.randomUUID();
    const payload: QueuedOfflineSalePayload = {
      ...input,
      branch_id: branchId,
      tenant_id: tenantId,
      device_id: deviceId,
      cash_session_id: input.cash_session_id,
      operator_id: input.operator_id,
      local_sequence: localSequence,
      total_amount: evaluation.totalAmount,
      change_amount: evaluation.changeAmount,
      price_snapshot_at: evaluation.anchor.server_time,
      offline_anchor: evaluation.anchor,
      queued_at: this.nowIso(),
    };

    const entry = this.operationJournal.addOperation({
      uuid,
      type: 'sale:create',
      payload,
      idempotencyKey: uuid,
    });

    return { entry, payload };
  }

  private nextLocalSequence(): number {
    const current = this.operationJournal.getAll()
      .filter((entry) => entry.status !== 'migration_review' && Number.isFinite(entry.id))
      .reduce((max, entry) => Math.max(max, entry.id), 0);
    return current + 1;
  }
}

export const offlineSaleService = new OfflineSaleService();
