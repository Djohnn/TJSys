import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from '@/organization/organizationApi'

export interface PurchaseReceipt {
  id: string
  order: string
  order_number: string
  supplier_name: string
  branch_name: string
  status: string
  items: ReceiptItem[]
  created_at: string
  created_by_name: string
  linked_stock_movement: string | null
  linked_payable: string | null
  linked_fiscal_document: string | null
}

export interface ReceiptItem {
  id: string
  product: string
  product_name: string
  ordered_quantity: string
  received_quantity: string
  unit_name: string
  unit_symbol?: string
  unit_precision?: number
}

export interface SupplierReturn {
  id: string
  supplier_name: string
  order_number: string
  total: string
  reason: string
  status: string
  created_at: string
}

export interface RecurringTemplate {
  id: string
  name: string
  supplier_name: string
  frequency: string
  next_date: string
  is_active: boolean
}

export interface CreateReceiptPayload {
  order: string
  items: { product: string; received_quantity: string }[]
  idempotency_key?: string
}

export interface CreateReturnPayload {
  order: string
  items: { product: string; quantity: string }[]
  reason: string
  idempotency_key?: string
}

export function fetchReceipts(
  tenantId: string,
  params: { page?: string; status?: string; order?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<PurchaseReceipt>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', params.page)
  if (params.status) searchParams.set('status', params.status)
  if (params.order) searchParams.set('order', params.order)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<PurchaseReceipt>>(
    `/purchasing/receipts/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  ) as Promise<PaginatedResponse<PurchaseReceipt>>
}

export function fetchReceiptDetail(
  tenantId: string,
  receiptId: string,
  signal?: AbortSignal,
): Promise<PurchaseReceipt> {
  return apiRequest<PurchaseReceipt>(`/purchasing/receipts/${receiptId}/`, {
    tenantId,
    signal,
  }) as Promise<PurchaseReceipt>
}

export function createReceipt(
  tenantId: string,
  payload: CreateReceiptPayload,
): Promise<PurchaseReceipt> {
  return apiRequest<PurchaseReceipt>('/purchasing/receipts/', {
    method: 'POST',
    tenantId,
    body: payload,
    headers: payload.idempotency_key
      ? { 'Idempotency-Key': payload.idempotency_key }
      : undefined,
  }) as Promise<PurchaseReceipt>
}

export function cancelReceipt(
  tenantId: string,
  receiptId: string,
): Promise<void> {
  return apiRequest(`/purchasing/receipts/${receiptId}/cancel/`, {
    method: 'POST',
    tenantId,
  }) as Promise<void>
}

export function fetchReturns(
  tenantId: string,
  params: { page?: string; supplier?: string; order?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<SupplierReturn>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', params.page)
  if (params.supplier) searchParams.set('supplier', params.supplier)
  if (params.order) searchParams.set('order', params.order)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<SupplierReturn>>(
    `/purchasing/returns/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  ) as Promise<PaginatedResponse<SupplierReturn>>
}

export function createReturn(
  tenantId: string,
  payload: CreateReturnPayload,
): Promise<SupplierReturn> {
  return apiRequest<SupplierReturn>('/purchasing/returns/', {
    method: 'POST',
    tenantId,
    body: payload,
    headers: payload.idempotency_key
      ? { 'Idempotency-Key': payload.idempotency_key }
      : undefined,
  }) as Promise<SupplierReturn>
}

export function fetchTemplates(
  tenantId: string,
  params: { page?: string },
  signal?: AbortSignal,
): Promise<PaginatedResponse<RecurringTemplate>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', params.page)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<RecurringTemplate>>(
    `/purchasing/recurring-templates/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  ) as Promise<PaginatedResponse<RecurringTemplate>>
}

export function toggleTemplate(
  tenantId: string,
  templateId: string,
  isActive: boolean,
): Promise<RecurringTemplate> {
  return apiRequest<RecurringTemplate>(`/purchasing/recurring-templates/${templateId}/`, {
    method: 'PATCH',
    tenantId,
    body: { is_active: isActive },
  }) as Promise<RecurringTemplate>
}
