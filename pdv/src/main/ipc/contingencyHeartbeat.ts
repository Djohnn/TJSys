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
  const heartbeat: ContingencyHeartbeatInput = {};
  const deviceId = readString(payload, 'device_id') ?? readNestedId(payload, 'device') ?? auth.getDeviceId();
  if (deviceId) heartbeat.device_id = deviceId;
  copyBoolean(payload, 'device_active', heartbeat);
  copyBoolean(payload, 'device_revoked', heartbeat);
  const operatorId = extractOperatorId(payload);
  if (operatorId) {
    heartbeat.operator_id = operatorId;
    copyBoolean(payload, 'operator_active', heartbeat);
    copyBoolean(payload, 'operator_revoked', heartbeat);
  }
  return heartbeat;
}

function copyBoolean(
  payload: unknown,
  key: 'device_active' | 'device_revoked' | 'operator_active' | 'operator_revoked',
  heartbeat: ContingencyHeartbeatInput,
): void {
  const value = readBoolean(payload, key);
  if (value !== undefined) heartbeat[key] = value;
}

function readBoolean(payload: unknown, key: string): boolean | undefined {
  const direct = readBooleanFromObject(payload, key);
  if (direct !== undefined) return direct;

  const scope = key.startsWith('device_') ? 'device' : 'operator';
  const field = key.slice(scope.length + 1);
  const nested = readBooleanFromObject(readObject(payload, scope), field);
  if (nested !== undefined) return nested;

  const eligibility = readObject(payload, 'eligibility');
  return readBooleanFromObject(readObject(eligibility, scope), field);
}

function readBooleanFromObject(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

function readObject(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return (value as Record<string, unknown>)[key];
}

function readNestedId(payload: unknown, scope: 'device' | 'operator'): string | null {
  return readString(readObject(payload, scope), 'id');
}

function readString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
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
  const directId = normalizeId((value as { operator_id?: unknown }).operator_id);
  if (directId) return directId;
  const direct = normalizeId((value as { operator?: unknown }).operator);
  if (direct) return direct;

  const nested = (value as { operator?: { id?: unknown } }).operator;
  return normalizeId(nested?.id);
}

function normalizeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
