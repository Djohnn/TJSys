import { apiRequest } from '@/api/client'

export interface FiscalEmitter {
  id: string
  branch: string
  provider: string
  cpf_cnpj: string
  ie: string
  registered_at_provider: boolean
  registration_source: string
  is_active: boolean
  configured?: boolean
  created_at: string
  updated_at: string
}

export interface FiscalDocument {
  id: string
  direction: 'INPUT' | 'OUTPUT'
  sale?: string
  purchase_order?: string
  receipt?: string
  status: string
  attempt_number: number
  provider_document_id: string
  cfop: string
  protocol: string
  xml_key: string
  pdf_key: string
  error_detail: string
  retry_count: number
  is_active: boolean
  created_at: string
  updated_at: string
  timeline?: Array<{ status: string; created_at: string }>
}

export interface FiscalProductConfig {
  id: string
  product: string
  cst_icms: string
  cst_pis: string
  cst_cofins: string
  aliquota_icms: string
  origem: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ValidateFiscalResult {
  issues: string[]
  warnings: string[]
  requires_attention: boolean
  created: boolean
  document_id: string | null
}

function buildQs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      search.set(key, String(val))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function listEmitters(
  params: { branch?: string; provider?: string; page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<FiscalEmitter>> {
  const qs = buildQs({ branch: params.branch, provider: params.provider, page: params.page })
  return apiRequest<PaginatedResponse<FiscalEmitter>>(`/fiscal/emitters/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<FiscalEmitter>>
}

export function createEmitter(
  data: { branch: string; provider: string; cpf_cnpj: string; ie?: string; api_key?: string },
  tenantId?: string | number,
): Promise<FiscalEmitter> {
  return apiRequest<FiscalEmitter>('/fiscal/emitters/', {
    method: 'POST',
    body: data,
    tenantId,
  }) as Promise<FiscalEmitter>
}

export function updateEmitter(
  id: string,
  data: { branch?: string; provider?: string; cpf_cnpj?: string; ie?: string; api_key?: string },
  tenantId?: string | number,
): Promise<FiscalEmitter> {
  return apiRequest<FiscalEmitter>(`/fiscal/emitters/${id}/`, {
    method: 'PATCH',
    body: data,
    tenantId,
  }) as Promise<FiscalEmitter>
}

export function getEmitter(id: string, tenantId?: string | number): Promise<FiscalEmitter> {
  return apiRequest<FiscalEmitter>(`/fiscal/emitters/${id}/`, { tenantId }) as Promise<FiscalEmitter>
}

export function listDocuments(
  params: { status?: string; direction?: string; sale?: string; page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<FiscalDocument>> {
  const qs = buildQs({ status: params.status, direction: params.direction, sale: params.sale, page: params.page })
  return apiRequest<PaginatedResponse<FiscalDocument>>(`/fiscal/documents/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<FiscalDocument>>
}

export function getDocument(id: string, tenantId?: string | number): Promise<FiscalDocument> {
  return apiRequest<FiscalDocument>(`/fiscal/documents/${id}/`, { tenantId }) as Promise<FiscalDocument>
}

export function retryDocument(
  id: string,
  reason: string,
  tenantId?: string | number,
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`/fiscal/documents/${id}/retry/`, {
    method: 'POST',
    body: { reason },
    tenantId,
  }) as Promise<{ detail: string }>
}

export function cancelDocument(
  id: string,
  reason: string,
  tenantId?: string | number,
): Promise<{ detail: string }> {
  return apiRequest<{ detail: string }>(`/fiscal/documents/${id}/cancel/`, {
    method: 'POST',
    body: { reason },
    tenantId,
  }) as Promise<{ detail: string }>
}

export async function downloadDocumentXml(id: string, tenantId?: string | number): Promise<Blob> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  const headers: Record<string, string> = { Accept: 'application/xml' }
  if (tenantId != null) headers['X-Tenant-ID'] = String(tenantId)
  const response = await fetch(`${baseUrl}/fiscal/documents/${id}/xml/`, {
    credentials: 'include',
    headers,
  })
  if (!response.ok) {
    throw new Error(`Falha ao baixar XML: ${response.statusText}`)
  }
  return response.blob()
}

export async function downloadDocumentPdf(id: string, tenantId?: string | number): Promise<Blob> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
  const headers: Record<string, string> = { Accept: 'application/pdf' }
  if (tenantId != null) headers['X-Tenant-ID'] = String(tenantId)
  const response = await fetch(`${baseUrl}/fiscal/documents/${id}/pdf/`, {
    credentials: 'include',
    headers,
  })
  if (!response.ok) {
    throw new Error(`Falha ao baixar PDF: ${response.statusText}`)
  }
  return response.blob()
}

export function listProductConfigs(
  params: { product?: string; page?: number; tenantId?: string | number } = {},
): Promise<PaginatedResponse<FiscalProductConfig>> {
  const qs = buildQs({ product: params.product, page: params.page })
  return apiRequest<PaginatedResponse<FiscalProductConfig>>(`/fiscal/product-configs/${qs}`, {
    tenantId: params.tenantId,
  }) as Promise<PaginatedResponse<FiscalProductConfig>>
}

export function upsertProductConfig(
  data: { product: string; cst_icms?: string; cst_pis?: string; cst_cofins?: string; aliquota_icms?: string; origem?: string },
  tenantId?: string | number,
): Promise<FiscalProductConfig> {
  return apiRequest<FiscalProductConfig>('/fiscal/product-configs/', {
    method: 'POST',
    body: data,
    tenantId,
  }) as Promise<FiscalProductConfig>
}

export function validateFiscalReceipt(
  receiptId: string,
  cfop: string,
  tenantId?: string | number,
): Promise<ValidateFiscalResult> {
  return apiRequest<ValidateFiscalResult>(`/receipts/${receiptId}/validate-fiscal/`, {
    method: 'POST',
    body: { cfop },
    tenantId,
  }) as Promise<ValidateFiscalResult>
}