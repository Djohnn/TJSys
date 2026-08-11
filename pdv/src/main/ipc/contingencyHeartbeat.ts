import { auth } from '../services/auth';
import type { ContingencyHeartbeatInput } from '../services/contingencyPolicy';

export function extractServerTime(headerDate: unknown, payload: unknown): string | null {
  if (typeof headerDate === 'string' && headerDate.trim()) return headerDate;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const serverTime = (payload as { server_time?: unknown }).server_time;
    if (typeof serverTime === 'string' && serverTime.trim()) return serverTime;
  }
  return null;
}

export function buildEligibilityHeartbeat(payload: unknown): ContingencyHeartbeatInput {
  const heartbeat: ContingencyHeartbeatInput = {
    device_id: auth.getDeviceId(),
    device_active: true,
    device_revoked: false,
  };
  const operatorId = extractOperatorId(payload);
  if (operatorId) {
    heartbeat.operator_id = operatorId;
    heartbeat.operator_active = true;
    heartbeat.operator_revoked = false;
  }
  return heartbeat;
}

function extractOperatorId(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    return uniqueOperatorId(payload);
  }
  if (payload && typeof payload === 'object') {
    const operatorId = readOperatorId(payload);
    if (operatorId) return operatorId;

    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results)) {
      return uniqueOperatorId(results);
    }
  }
  return null;
}

function uniqueOperatorId(items: unknown[]): string | null {
  const operatorIds = Array.from(
    new Set(
      items
        .map((item) => readOperatorId(item))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  return operatorIds.length === 1 ? operatorIds[0] : null;
}

function readOperatorId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const direct = normalizeId((value as { operator?: unknown }).operator);
  if (direct) return direct;

  const nested = (value as { operator?: { id?: unknown } }).operator;
  return normalizeId(nested?.id);
}

function normalizeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
