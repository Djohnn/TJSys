import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// =============================================================================
// Pipeline
// =============================================================================

export interface PipelineStage {
  id: string
  name: string
  description: string
  order: number
  color: string
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

export interface Pipeline {
  id: string
  name: string
  description: string
  is_default: boolean
  is_active: boolean
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}

export function fetchPipelines(
  tenantId: string,
  params: { page?: number; is_active?: boolean } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Pipeline>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Pipeline>>(`/crm/pipelines/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Pipeline>>
}

export function fetchPipeline(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Pipeline> {
  return apiRequest<Pipeline>(`/crm/pipelines/${id}/`, {
    tenantId,
    signal,
  }) as Promise<Pipeline>
}

// =============================================================================
// Opportunity
// =============================================================================

export interface Opportunity {
  id: string
  pipeline: string
  pipeline_name: string
  stage: string
  stage_name: string
  customer: string
  customer_name: string
  assigned_to: string | null
  assigned_to_name: string
  title: string
  description: string
  value: string
  currency: string
  probability: number
  expected_close_date: string | null
  actual_close_date: string | null
  status: string
  lost_reason: string
  source: string
  notes: string
  converted_sale: string | null
  created_at: string
  updated_at: string
}

export function fetchOpportunities(
  tenantId: string,
  params: { page?: number; pipeline?: string; stage?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Opportunity>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.pipeline) searchParams.set('pipeline', params.pipeline)
  if (params.stage) searchParams.set('stage', params.stage)
  if (params.status) searchParams.set('status', params.status)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Opportunity>>(`/crm/opportunities/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Opportunity>>
}

export function fetchOpportunity(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Opportunity> {
  return apiRequest<Opportunity>(`/crm/opportunities/${id}/`, {
    tenantId,
    signal,
  }) as Promise<Opportunity>
}

export function convertOpportunityToSale(
  tenantId: string,
  opportunityId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/crm/opportunities/${opportunityId}/convert/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

// =============================================================================
// Activity
// =============================================================================

export interface ActivityType {
  id: string
  name: string
  description: string
  color: string
  icon: string
  is_active: boolean
}

export interface Activity {
  id: string
  activity_type: string
  activity_type_name: string
  customer: string
  customer_name: string
  opportunity: string | null
  opportunity_title: string
  assigned_to: string | null
  assigned_to_name: string
  title: string
  description: string
  status: string
  due_date: string | null
  completed_at: string | null
  notes: string
  reminder_date: string | null
  is_recurring: boolean
  recurrence_interval: string
  created_at: string
  updated_at: string
}

export function fetchActivityTypes(
  tenantId: string,
  params: { page?: number; is_active?: boolean } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<ActivityType>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.is_active !== undefined) searchParams.set('is_active', String(params.is_active))
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<ActivityType>>(`/crm/activity-types/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<ActivityType>>
}

export function fetchActivities(
  tenantId: string,
  params: { page?: number; customer?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Activity>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.customer) searchParams.set('customer', params.customer)
  if (params.status) searchParams.set('status', params.status)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Activity>>(`/crm/activities/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<Activity>>
}

export function completeActivity(
  tenantId: string,
  activityId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/crm/activities/${activityId}/complete/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

export function cancelActivity(
  tenantId: string,
  activityId: string,
): Promise<unknown> {
  return apiRequest<unknown>(`/crm/activities/${activityId}/cancel/`, {
    method: 'POST',
    tenantId,
  }) as Promise<unknown>
}

// =============================================================================
// Customer History
// =============================================================================

export interface CustomerHistoryEntry {
  id: string
  customer: string
  customer_name: string
  event_type: string
  reference_id: string | null
  reference_model: string
  title: string
  description: string
  amount: string | null
  metadata: Record<string, unknown>
  created_by: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

export function fetchCustomerHistory(
  tenantId: string,
  params: { page?: number; customer?: string; event_type?: string } = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<CustomerHistoryEntry>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.customer) searchParams.set('customer', params.customer)
  if (params.event_type) searchParams.set('event_type', params.event_type)
  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<CustomerHistoryEntry>>(`/crm/customer-history/${qs ? `?${qs}` : ''}`, {
    tenantId,
    signal,
  }) as Promise<PaginatedResponse<CustomerHistoryEntry>>
}
