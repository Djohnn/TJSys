import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchMarketplaces } from './ecommerceApi'
import type { PaginatedResponse } from './ecommerceApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  pending: 'Pendente',
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  pending: 'warning',
}

const COMMISSION_TYPE_LABELS: Record<string, string> = {
  percentage: 'Porcentagem',
  fixed: 'Fixo',
}

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

export default function MarketplacesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const channelFilter = searchParams.get('channel') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketplaces', tenantId, page, statusFilter, channelFilter],
    queryFn: ({ signal }) =>
      fetchMarketplaces(tenantId, {
        page,
        status: statusFilter || undefined,
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

  if (isLoading) return <LoadingState message="Carregando marketplaces..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar marketplaces.</p>

  const marketplaces = data?.results ?? []
  const channels = channelsData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="marketplaces-page">
      <Card title="Marketplaces">
        <div data-testid="marketplaces-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="marketplace-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="marketplace-status"
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
            <label htmlFor="marketplace-channel" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Canal</label>
            <select
              id="marketplace-channel"
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

        {marketplaces.length === 0 ? (
          <EmptyState title="Nenhum marketplace encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Nome</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Canal</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Comissão</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Taxa %</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Taxa Fixa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {marketplaces.map(marketplace => (
                  <tr key={marketplace.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-brand-600">{marketplace.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {channels.find(c => c.id === marketplace.channel)?.name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={statusVariant[marketplace.status] ?? 'neutral'}>
                        {STATUS_LABELS[marketplace.status] ?? marketplace.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {COMMISSION_TYPE_LABELS[marketplace.commission_type] ?? marketplace.commission_type}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {formatCurrency(marketplace.fee_percentage)}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {formatCurrency(marketplace.fee_fixed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Total: {data?.count ?? 0} marketplaces
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
