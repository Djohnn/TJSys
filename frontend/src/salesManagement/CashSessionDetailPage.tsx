import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchCashSession } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'

export default function CashSessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: session, isLoading, error } = useQuery({
    queryKey: ['cash-session', tenantId, id],
    queryFn: ({ signal }) => fetchCashSession(tenantId, id!, signal),
    enabled: !!tenantId && !!id,
    retry: false,
  })

  if (isLoading) return <LoadingState message="Carregando sessão..." />

  if (error) {
    const status = isApiProblemError(error) ? error.problem.status : 500
    const correlationId = isApiProblemError(error) ? error.problem.correlationId : undefined
    return <ErrorState status={status} correlationId={correlationId} />
  }

  if (!session) return null

  const diff = parseFloat(session.difference)
  const diffColor = diff < 0 ? 'red' : 'green'

  return (
    <div data-testid="cash-session-detail-page">
      <h2>Sessão de Caixa {session.date}</h2>
      <p>
        <strong>Filial:</strong> {session.branch_name} &mdash; <strong>Operador:</strong> {session.operator_name}
      </p>
      <p>
        <strong>Abertura:</strong> {new Date(session.opened_at).toLocaleString('pt-BR')}
        {session.closed_at && (
          <> &mdash; <strong>Fechamento:</strong> {new Date(session.closed_at).toLocaleString('pt-BR')}</>
        )}
      </p>
      <p>
        <strong>Esperado:</strong> {session.expected_balance} &mdash; <strong>Contado:</strong>{' '}
        {session.actual_balance} &mdash; <strong style={{ color: diffColor }}>Diferença: {session.difference}</strong>
      </p>

      <h3>Movimentações</h3>
      <table data-testid="movements-table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Valor</th>
            <th>Descrição</th>
          </tr>
        </thead>
        <tbody>
          {session.movements.map((movement) => (
            <tr key={movement.id} data-testid="movement-row">
              <td>{new Date(movement.created_at).toLocaleTimeString('pt-BR')}</td>
              <td>{movement.type_label}</td>
              <td>{movement.amount}</td>
              <td>{movement.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        <Link to="/financial/cash-sessions">Voltar para sessões</Link>
      </p>
    </div>
  )
}
