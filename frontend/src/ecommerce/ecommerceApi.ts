import { apiRequest } from '@/api/client'

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Channel {
  id: string
  name: string
  slug: string
  channel_type: 'ecommerce' | 'marketplace' | 'pos' | 'api'
  status: 'active' | 'inactive' | 'pending'
  description: string
  base_url: string
  api_key: string
  api_secret: string
  webhook_url: string
  config_json: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ChannelListParams {
  page?: number
  status?: string
  type?: string
}

export async function fetchChannels(
  tenantId: string,
  params: ChannelListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Channel>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.type) searchParams.set('type', params.type)

  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Channel>>(
    `/ecommerce/channels/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  )
}

export async function fetchChannelById(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Channel> {
  return apiRequest<Channel>(`/ecommerce/channels/${id}/`, { tenantId, signal })
}

export async function createChannel(
  tenantId: string,
  data: Partial<Channel>,
  signal?: AbortSignal,
): Promise<Channel> {
  return apiRequest<Channel>('/ecommerce/channels/', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function updateChannel(
  tenantId: string,
  id: string,
  data: Partial<Channel>,
  signal?: AbortSignal,
): Promise<Channel> {
  return apiRequest<Channel>(`/ecommerce/channels/${id}/`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export interface Marketplace {
  id: string
  channel: string
  name: string
  slug: string
  marketplace_id: string
  status: 'active' | 'inactive' | 'pending'
  commission_type: 'percentage' | 'fixed'
  commission_value: string
  fee_percentage: string
  fee_fixed: string
  config_json: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MarketplaceListParams {
  page?: number
  status?: string
  channel?: string
}

export async function fetchMarketplaces(
  tenantId: string,
  params: MarketplaceListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Marketplace>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.channel) searchParams.set('channel', params.channel)

  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<Marketplace>>(
    `/ecommerce/marketplaces/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  )
}

export async function fetchMarketplaceById(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<Marketplace> {
  return apiRequest<Marketplace>(`/ecommerce/marketplaces/${id}/`, { tenantId, signal })
}

export async function createMarketplace(
  tenantId: string,
  data: Partial<Marketplace>,
  signal?: AbortSignal,
): Promise<Marketplace> {
  return apiRequest<Marketplace>('/ecommerce/marketplaces/', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function updateMarketplace(
  tenantId: string,
  id: string,
  data: Partial<Marketplace>,
  signal?: AbortSignal,
): Promise<Marketplace> {
  return apiRequest<Marketplace>(`/ecommerce/marketplaces/${id}/`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export interface OnlineOrder {
  id: string
  channel: string
  marketplace?: string | null
  sale?: string | null
  external_order_id: string
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
  payment_status: 'pending' | 'approved' | 'rejected' | 'refunded'
  customer_name: string
  customer_email: string
  customer_phone: string
  shipping_address: Record<string, unknown>
  billing_address: Record<string, unknown>
  subtotal: string
  shipping_cost: string
  discount_amount: string
  tax_amount: string
  total_amount: string
  currency: string
  notes: string
  shipped_at?: string | null
  delivered_at?: string | null
  created_at: string
  updated_at: string
}

export interface OnlineOrderListParams {
  page?: number
  status?: string
  payment_status?: string
  channel?: string
}

export async function fetchOnlineOrders(
  tenantId: string,
  params: OnlineOrderListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<OnlineOrder>> {
  const searchParams = new URLSearchParams()
  if (params.page) searchParams.set('page', String(params.page))
  if (params.status) searchParams.set('status', params.status)
  if (params.payment_status) searchParams.set('payment_status', params.payment_status)
  if (params.channel) searchParams.set('channel', params.channel)

  const qs = searchParams.toString()
  return apiRequest<PaginatedResponse<OnlineOrder>>(
    `/ecommerce/online-orders/${qs ? `?${qs}` : ''}`,
    { tenantId, signal },
  )
}

export async function fetchOnlineOrderById(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/`, { tenantId, signal })
}

export async function createOnlineOrder(
  tenantId: string,
  data: Partial<OnlineOrder>,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>('/ecommerce/online-orders/', {
    method: 'POST',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function updateOnlineOrder(
  tenantId: string,
  id: string,
  data: Partial<OnlineOrder>,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/`, {
    method: 'PATCH',
    tenantId,
    body: JSON.stringify(data),
    signal,
  })
}

export async function confirmOnlineOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/confirm/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}

export async function shipOnlineOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/ship/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}

export async function deliverOnlineOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/deliver/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}

export async function cancelOnlineOrder(
  tenantId: string,
  id: string,
  signal?: AbortSignal,
): Promise<OnlineOrder> {
  return apiRequest<OnlineOrder>(`/ecommerce/online-orders/${id}/cancel/`, {
    method: 'POST',
    tenantId,
    signal,
  })
}
