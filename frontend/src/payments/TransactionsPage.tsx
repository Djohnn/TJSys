import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listTransactions } from './paymentsApi'
import type { PaymentTransaction, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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
  const tenantId = selectedTenant?.tenant_id
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
    <div data-testid="transactions-page" className="p-6">
      <Card title="Transações de Pagamento">
        <div data-testid="transactions-filters" className="mb-4 flex items-center gap-3">
          <label className="text-sm font-medium text-neutral-700">
            Intent:
            <input
              value={intentFilter}
              onChange={e => { setIntentFilter(e.target.value); setPage(1) }}
              data-testid="filter-intent"
              className="ml-2 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            Tipo:
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              data-testid="filter-type"
              className="ml-2 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="transactions-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Bruto</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Taxa</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Líquido</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Referência</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Data</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(tx => (
                <tr key={tx.id} data-testid="transaction-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(tx.gross_amount)}</td>
                  <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(tx.fee_amount)}</td>
                  <td className="px-4 py-3 text-neutral-700 tabular-nums">{formatBRL(tx.net_amount)}</td>
                  <td className="px-4 py-3 text-neutral-700">{TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}</td>
                  <td className="px-4 py-3 text-neutral-700">{tx.provider_reference}</td>
                  <td className="px-4 py-3 text-neutral-700">{formatDate(tx.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div data-testid="pagination" className="mt-4 flex items-center gap-2">
          {data?.previous && (
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} data-testid="prev-page">
              Anterior
            </Button>
          )}
          {data?.next && (
            <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} data-testid="next-page">
              Próximo
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
