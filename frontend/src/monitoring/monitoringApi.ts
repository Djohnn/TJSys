import { apiRequest } from '@/api/client'

export interface OperationsData {
  health: { status: string; checks: { database: string; cache: string }; timestamp: string }
  readiness: { status: string; services: { database: string; cache: string } }
  system_metrics: {
    outbox: { total: number; pending: number; failed: number; dead_letter: number; published: number; oldest_pending_at: string | null; newest_pending_at: string | null }
    fiscal: { total: number; pending: number; processing: number; concluded: number; rejected: number; cancelled: number; failed: number }
  }
  runbook_links: Array<{ id: string; label: string; url: string }>
}

export function fetchOperations(tenantId?: string | number): Promise<OperationsData> {
  return apiRequest<OperationsData>('/monitoring/operations/', { tenantId }) as Promise<OperationsData>
}