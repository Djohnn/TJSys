import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchCashflow } from './financialApi'
import type { PaginatedResponse } from './financialApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

function formatCurrency(value: string | null): string {
  if (value === null) return '-'
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value ?? '-'
  }
}

export default function CashflowPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Number(searchParams.get('page')) || 1
  const dateFrom = searchParams.get('date_from') || ''
  const dateTo = searchParams.get('date_to') || ''
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashflow', tenantId, page, dateFrom, dateTo, branchFilter],
    queryFn: ({ signal }) =>
      fetchCashflow(tenantId, {
        page,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        branch: branchFilter || undefined,
      }, signal),
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

  if (isLoading) return <LoadingState message="Carregando fluxo de caixa..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar fluxo de caixa.</p>

  const entries = data?.results ?? []
  const branches = branchesData?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="cashflow-page">
      <Card title="Fluxo de Caixa">
        <div data-testid="cashflow-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="cf-date-from" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data inicial</label>
            <input
              id="cf-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setFilter('date_from', e.target.value)}
              aria-label="Data inicial"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cf-date-to" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Data final</label>
            <input
              id="cf-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setFilter('date_to', e.target.value)}
              aria-label="Data final"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cf-branch" className="block text-sm font-medium text-neutral-700 mb-1 sr-only">Filial</label>
            <select
              id="cf-branch"
              value={branchFilter}
              onChange={(e) => setFilter('branch', e.target.value)}
              aria-label="Filtrar por filial"
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">Todas as filiais</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        {entries.length === 0 && (
          <EmptyState title="Nenhum lançamento encontrado" description="Nenhum lançamento de fluxo de caixa." />
        )}

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="cashflow-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Descrição</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Entrada</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saída</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saldo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-testid="cashflow-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{new Date(entry.date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.description}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{entry.inflow ? `R$ ${formatCurrency(entry.inflow)}` : '-'}</td>
                    <td className="px-4 py-3 text-red-700 font-medium">{entry.outflow ? `R$ ${formatCurrency(entry.outflow)}` : '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">R$ {formatCurrency(entry.balance)}</td>
                    <td className="px-4 py-3 text-neutral-700">{entry.branch_name ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 mt-6">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page - 1)); setSearchParams(next) }} type="button">
              Anterior
            </Button>
            <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page + 1)); setSearchParams(next) }} type="button">
              Próxima
            </Button>
          </nav>
        )}
      </Card>
    </div>
  )
}
