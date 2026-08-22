import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchChannels } from './ecommerceApi'
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

const TYPE_LABELS: Record<string, string> = {
  ecommerce: 'E-commerce',
  marketplace: 'Marketplace',
  pos: 'PDV',
  api: 'API',
}

export default function ChannelsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const statusFilter = searchParams.get('status') || ''
  const typeFilter = searchParams.get('type') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['channels', tenantId, page, statusFilter, typeFilter],
    queryFn: ({ signal }) =>
      fetchChannels(tenantId, {
        page,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
      }, signal),
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

  if (isLoading) return <LoadingState message="Carregando canais..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar canais.</p>

  const channels = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="channels-page">
      <Card title="Canais de Venda">
        <div data-testid="channels-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="channel-status" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Status</label>
            <select
              id="channel-status"
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
            <label htmlFor="channel-type" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Tipo</label>
            <select
              id="channel-type"
              value={typeFilter}
              onChange={e => setFilter('type', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todos</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {channels.length === 0 ? (
          <EmptyState title="Nenhum canal encontrado." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Nome</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Slug</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Tipo</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                {channels.map(channel => (
                  <tr key={channel.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-brand-600">{channel.name}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">{channel.slug}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {TYPE_LABELS[channel.channel_type] ?? channel.channel_type}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm">
                      <Badge variant={statusVariant[channel.status] ?? 'neutral'}>
                        {STATUS_LABELS[channel.status] ?? channel.status}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-neutral-700">
                      {channel.base_url || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Total: {data?.count ?? 0} canais
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
