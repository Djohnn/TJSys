import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchCashSessions } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

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
      <h2>Sessões de Caixa</h2>

      <div data-testid="session-filters">
        <label htmlFor="cs-date-from">De</label>
        <input
          id="cs-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => updateParam('date_from', e.target.value)}
        />
        <label htmlFor="cs-date-to">Até</label>
        <input
          id="cs-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => updateParam('date_to', e.target.value)}
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="Nenhuma sessão" description="Nenhuma sessão de caixa encontrada." />
      ) : (
        <table data-testid="cash-sessions-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Filial</th>
              <th>Operador</th>
              <th>Esperado</th>
              <th>Contado</th>
              <th>Diferença</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const diff = parseFloat(session.difference)
              const diffColor = diff < 0 ? 'red' : 'green'
              return (
                <tr key={session.id} data-testid="session-row">
                  <td>{session.date}</td>
                  <td>{session.branch_name}</td>
                  <td>{session.operator_name}</td>
                  <td>{session.expected_balance}</td>
                  <td>{session.actual_balance}</td>
                  <td style={{ color: diffColor }}>{session.difference}</td>
                  <td>
                    <Link to={`/financial/cash-sessions/${session.id}`}>Detalhes</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
