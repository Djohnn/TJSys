import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchOnlineOrders } from './ecommerceApi'
import type { PaginatedResponse } from './ecommerceApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  processing: 'Processando',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
  refunded: 'danger',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  refunded: 'Reembolsado',
}

const paymentStatusVariant: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  refunded: 'danger',
}

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

export default function OnlineOrdersPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const paymentStatusFilter = searchParams.get('payment_status') || ''
  const channelFilter = searchParams.get('channel') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['onlineOrders', tenantId, page, statusFilter, paymentStatusFilter, channelFilter],
    queryFn: ({ signal }) =>
      fetchOnlineOrders(tenantId, {
        page,
        status: statusFilter || undefined,
        payment_status: paymentStatusFilter || undefined,
        channel: channelFilter || undefined,
      }, signal),
    enabled: !!tenantId,
  })

  const { data: channelsData } = useQuery({
    queryKey: ['channels', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<{ id: string; name: string }>>('/ecommerce/channels/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<{ id: string; name: string }>>,
    enabled: !!tenantId,
  })

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    next.set('page', '1')
    setSearchParams(next)
  }

  if (isLoading) return <LoadingState message="Carregando pedidos online..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar pedidos online.</p>

  const orders = data?.results ?? []
  const channels = channelsData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="online-orders-page">
      <Card title="Pedidos Online">
        <div data-testid="online-orders-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="order-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="order-status"
              value={statusFilter}
              onChange={e => setFilter('status', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="order-payment-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status Pagamento</label>
            <select
              id="order-payment-status"
              value={paymentStatusFilter}
              onChange={e => setFilter('payment_status', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="order-channel" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Canal</label>
            <select
              id="order-channel"
              value={channelFilter}
              onChange={e => setFilter('channel', e.target.value)}
              className="block w-48 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {channels.map(channel => (
                <option key={channel.id} value={channel.id}>{channel.name}</option>
              ))}
            </select>
          </div>
        </div>

        {orders.length === 0 ? (
          <EmptyState title="Nenhum pedido online encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Pedido</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Cliente</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Pagamento</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-brand-600">
                      {order.external_order_id}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {order.customer_name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={statusVariant[order.status] ?? 'neutral'}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={paymentStatusVariant[order.payment_status] ?? 'neutral'}>
                        {PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-neutral-900">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {new Date(order.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Total: {data?.count ?? 0} pedidos
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setFilter('page', String(page - 1))}
            >
              Anterior
            </Button>
            <span className="flex items-center px-3 text-sm text-neutral-700">
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setFilter('page', String(page + 1))}
            >
              Próxima
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
