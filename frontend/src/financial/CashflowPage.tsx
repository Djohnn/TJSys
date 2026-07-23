import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchCashflow } from './financialApi'
import type { PaginatedResponse } from './financialApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

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
      <h2>Fluxo de Caixa</h2>

      <div data-testid="cashflow-filters">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setFilter('date_from', e.target.value)}
          aria-label="Data inicial"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setFilter('date_to', e.target.value)}
          aria-label="Data final"
        />
        <select
          value={branchFilter}
          onChange={(e) => setFilter('branch', e.target.value)}
          aria-label="Filtrar por filial"
        >
          <option value="">Todas as filiais</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {entries.length === 0 && (
        <EmptyState title="Nenhum lançamento encontrado" description="Nenhum lançamento de fluxo de caixa." />
      )}

      {entries.length > 0 && (
        <table data-testid="cashflow-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th>Saldo</th>
              <th>Filial</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} data-testid="cashflow-row">
                <td>{new Date(entry.date).toLocaleDateString('pt-BR')}</td>
                <td>{entry.description}</td>
                <td>{entry.inflow ? `R$ ${formatCurrency(entry.inflow)}` : '-'}</td>
                <td>{entry.outflow ? `R$ ${formatCurrency(entry.outflow)}` : '-'}</td>
                <td>R$ {formatCurrency(entry.balance)}</td>
                <td>{entry.branch_name ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page - 1)); setSearchParams(next) }} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => { const next = new URLSearchParams(searchParams); next.set('page', String(page + 1)); setSearchParams(next) }} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
