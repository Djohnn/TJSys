import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchCashSession } from './salesManagementApi'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

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

  return (
    <div data-testid="cash-session-detail-page">
      <Card>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Sessão de Caixa {session.date}</h2>
            <div className="mt-2 space-y-1 text-sm text-neutral-600">
              <p>
                <span className="font-medium text-neutral-700">Filial:</span> {session.branch_name} &mdash;{' '}
                <span className="font-medium text-neutral-700">Operador:</span> {session.operator_name}
              </p>
              <p>
                <span className="font-medium text-neutral-700">Abertura:</span>{' '}
                {new Date(session.opened_at).toLocaleString('pt-BR')}
                {session.closed_at && (
                  <> &mdash; <span className="font-medium text-neutral-700">Fechamento:</span>{' '}
                    {new Date(session.closed_at).toLocaleString('pt-BR')}</>
                )}
              </p>
              <p>
                <span className="font-medium text-neutral-700">Esperado:</span> {session.expected_balance} &mdash;{' '}
                <span className="font-medium text-neutral-700">Contado:</span> {session.actual_balance} &mdash;{' '}
                <span className="font-medium text-neutral-700">Diferença:</span>{' '}
                <Badge variant={diff < 0 ? 'danger' : 'success'}>{session.difference}</Badge>
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-3">Movimentações</h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-testid="movements-table" className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Hora</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {session.movements.map((movement) => (
                    <tr key={movement.id} data-testid="movement-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-neutral-700">{new Date(movement.created_at).toLocaleTimeString('pt-BR')}</td>
                      <td className="px-4 py-3 text-neutral-700">{movement.type_label}</td>
                      <td className="px-4 py-3 text-neutral-700">{movement.amount}</td>
                      <td className="px-4 py-3 text-neutral-700">{movement.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Link to="/app/financial/cash-sessions" className="text-primary-600 hover:text-primary-700 font-medium text-sm">Voltar para sessões</Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
