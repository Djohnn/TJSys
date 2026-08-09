import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchMovements } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatQuantity } from '@/components/formatQuantity'
import Badge from '@/components/ui/Badge'

const TYPE_LABELS: Record<string, string> = {
  in: 'Entrada',
  out: 'Saída',
  transfer: 'Transferência',
  adjust: 'Ajuste',
}

const TYPE_BADGE: Record<string, 'success' | 'danger' | 'info' | 'warning'> = {
  in: 'success',
  out: 'danger',
  transfer: 'info',
  adjust: 'warning',
}

export default function MovementsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const typeFilter = searchParams.get('type') || ''
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['movements', tenantId, page, dateFrom, dateTo, typeFilter, branchFilter],
    queryFn: ({ signal }) =>
      fetchMovements(
        tenantId,
        {
          page,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          type: typeFilter || undefined,
          branch: branchFilter || undefined,
        },
        signal,
      ),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<{ id: string; name: string }>>('/branches/', {
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

  if (isLoading) return <LoadingState message="Carregando movimentações..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar movimentações.</p>

  const movements = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="movements-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Movimentações de Estoque</h2>

      <Card>
        <div data-testid="movements-filters" className="flex flex-wrap gap-3">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setFilter('date_from', e.target.value)}
            aria-label="Data inicial"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setFilter('date_to', e.target.value)}
            aria-label="Data final"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
          <select
            value={typeFilter}
            onChange={(e) => setFilter('type', e.target.value)}
            aria-label="Filtrar por tipo"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">Todos os tipos</option>
            <option value="in">Entrada</option>
            <option value="out">Saída</option>
            <option value="transfer">Transferência</option>
            <option value="adjust">Ajuste</option>
          </select>
          <select
            value={branchFilter}
            onChange={(e) => setFilter('branch', e.target.value)}
            aria-label="Filtrar por filial"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          >
            <option value="">Todas as filiais</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </Card>

      {movements.length === 0 && (
        <EmptyState title="Nenhuma movimentação encontrada" description="Nenhuma movimentação registrada." />
      )}

      {movements.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="movements-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Qtd</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Motivo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Criado por</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((mov) => (
                  <tr key={mov.id} data-testid="movement-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{new Date(mov.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700">{mov.product_name}</td>
                    <td className="px-4 py-3">
                      <Badge testId="movement-type-badge" variant={TYPE_BADGE[mov.type] ?? 'neutral'}>{TYPE_LABELS[mov.type] ?? mov.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{formatQuantity(mov.quantity, { precision: mov.unit_precision, symbol: mov.unit_symbol })}</td>
                    <td className="px-4 py-3 text-neutral-700">{mov.reason}</td>
                    <td className="px-4 py-3 text-neutral-700">{mov.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
