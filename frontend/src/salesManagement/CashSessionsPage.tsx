import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchCashSessions } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function CashSessionsPage() {
  const { selectedTenant } = useTenant()
  const [searchParams, setSearchParams] = useSearchParams()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const page = Number(searchParams.get('page') ?? '1')
  const dateFrom = searchParams.get('date_from') ?? ''
  const dateTo = searchParams.get('date_to') ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cash-sessions', tenantId, page, dateFrom, dateTo],
    queryFn: ({ signal }) =>
      fetchCashSessions(tenantId, { page, date_from: dateFrom, date_to: dateTo }, signal),
    enabled: !!tenantId,
  })

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setSearchParams(next)
  }

  if (isLoading) return <LoadingState message="Carregando sessões de caixa..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar sessões.</p>

  const sessions = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="cash-sessions-page">
      <Card title="Sessões de Caixa">
        <div data-testid="session-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="cs-date-from" className="block text-sm font-medium text-neutral-700 mb-1">De</label>
            <input
              id="cs-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => updateParam('date_from', e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="cs-date-to" className="block text-sm font-medium text-neutral-700 mb-1">Até</label>
            <input
              id="cs-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => updateParam('date_to', e.target.value)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>

        {sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão" description="Nenhuma sessão de caixa encontrada." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="cash-sessions-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Filial</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Operador</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Esperado</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Contado</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Diferença</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const diff = parseFloat(session.difference)
                  return (
                    <tr key={session.id} data-testid="session-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-neutral-700">{session.date}</td>
                      <td className="px-4 py-3 text-neutral-700">{session.branch_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{session.operator_name}</td>
                      <td className="px-4 py-3 text-neutral-700">{session.expected_balance}</td>
                      <td className="px-4 py-3 text-neutral-700">{session.actual_balance}</td>
                      <td className="px-4 py-3">
                        <Badge variant={diff < 0 ? 'danger' : 'success'}>{session.difference}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/app/financial/cash-sessions/${session.id}`} className="text-primary-600 hover:text-primary-700 font-medium text-sm">Detalhes</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 mt-6">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} type="button">
              Anterior
            </Button>
            <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))} type="button">
              Próxima
            </Button>
          </nav>
        )}
      </Card>
    </div>
  )
}
