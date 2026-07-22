import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listTransactions } from './paymentsApi'
import type { PaymentTransaction, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'

const TYPE_LABELS: Record<string, string> = {
  authorization: 'Autorização',
  capture: 'Captura',
  cancel: 'Cancelamento',
  refund: 'Devolução',
}

function formatBRL(value: string): string {
  const num = Number(value)
  if (isNaN(num)) return value
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function TransactionsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
  const [page, setPage] = useState(1)
  const [intentFilter, setIntentFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedResponse<PaymentTransaction>>({
    queryKey: ['payment-transactions', tenantId, page, intentFilter, typeFilter],
    queryFn: () =>
      listTransactions({
        intent: intentFilter || undefined,
        transaction_type: typeFilter || undefined,
        page,
        tenantId,
      }),
    enabled: !!tenantId,
  })

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar transações.</p>

  return (
    <div data-testid="transactions-page">
      <h2>Transações de Pagamento</h2>

      <div data-testid="transactions-filters">
        <label>
          Intent:{' '}
          <input
            value={intentFilter}
            onChange={e => { setIntentFilter(e.target.value); setPage(1) }}
            data-testid="filter-intent"
          />
        </label>
        <label>
          Tipo:{' '}
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            data-testid="filter-type"
          >
            <option value="">Todos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <table data-testid="transactions-table">
        <thead>
          <tr><th>Bruto</th><th>Taxa</th><th>Líquido</th><th>Tipo</th><th>Referência</th><th>Data</th></tr>
        </thead>
        <tbody>
          {data?.results.map(tx => (
            <tr key={tx.id} data-testid="transaction-row">
              <td>{formatBRL(tx.gross_amount)}</td>
              <td>{formatBRL(tx.fee_amount)}</td>
              <td>{formatBRL(tx.net_amount)}</td>
              <td>{TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}</td>
              <td>{tx.provider_reference}</td>
              <td>{formatDate(tx.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div data-testid="pagination">
        {data?.previous && (
          <button type="button" onClick={() => setPage(p => p - 1)} data-testid="prev-page">
            Anterior
          </button>
        )}
        {data?.next && (
          <button type="button" onClick={() => setPage(p => p + 1)} data-testid="next-page">
            Próximo
          </button>
        )}
      </div>
    </div>
  )
}