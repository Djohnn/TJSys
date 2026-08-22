import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

export interface FinancialStatementTransaction {
  id: string
  effective_date: string
  description: string
  direction: string
  amount: string
  status: string
  balance: string
}

export interface FinancialStatement {
  account: {
    id: string
    name: string
    account_type: string
  }
  opening_balance: string
  closing_balance: string
  transactions: FinancialStatementTransaction[]
}

const DIRECTION_LABELS: Record<string, string> = {
  inflow: 'Entrada',
  outflow: 'Saída',
}

const DIRECTION_VARIANTS: Record<string, 'success' | 'danger' | 'neutral'> = {
  inflow: 'success',
  outflow: 'danger',
}

export default function FinancialStatementPage() {
  const { selectedTenant } = useTenant()
  const [accountId, setAccountId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['financial-statement', tenantId, accountId, dateFrom, dateTo],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (accountId) params.set('account', accountId)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      const qs = params.toString()
      return apiRequest<FinancialStatement>(`/financial/financial-statement/${qs ? `?${qs}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<FinancialStatement>
    },
    enabled: !!tenantId && !!accountId,
  })

  if (!accountId) {
    return (
      <div data-testid="financial-statement-page" className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-neutral-900">Extrato Financeiro</h2>
        </div>
        <EmptyState
          title="Selecione uma conta"
          description="Escolha uma conta para visualizar o extrato."
        />
      </div>
    )
  }

  if (isLoading) return <LoadingState message="Carregando extrato financeiro..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar extrato financeiro.</p>

  if (!data) return null

  return (
    <div data-testid="financial-statement-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Extrato Financeiro</h2>
      </div>

      <div className="flex gap-4">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm"
          placeholder="Data inicial"
          data-testid="financialstatement-date-from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-border rounded-lg text-sm"
          placeholder="Data final"
          data-testid="financialstatement-date-to"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Saldo Inicial</p>
            <p className="text-2xl font-bold text-neutral-900">
              {parseFloat(data.opening_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Saldo Final</p>
            <p className={`text-2xl font-bold ${parseFloat(data.closing_balance) >= 0 ? 'text-success' : 'text-danger'}`}>
              {parseFloat(data.closing_balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-neutral-600">Conta</p>
            <p className="text-lg font-semibold text-neutral-900">{data.account.name}</p>
            <p className="text-sm text-neutral-500">{data.account.account_type}</p>
          </div>
        </Card>
      </div>

      {data.transactions.length === 0 && (
        <EmptyState
          title="Nenhuma transação"
          description="Nenhuma transação encontrada para o período selecionado."
        />
      )}

      {data.transactions.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="financial-statement-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Data</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Descrição</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((transaction) => (
                  <tr key={transaction.id} data-testid="financialstatement-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{new Date(transaction.effective_date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-neutral-700 font-medium">{transaction.description}</td>
                    <td className="px-4 py-3">
                      <Badge variant={DIRECTION_VARIANTS[transaction.direction] || 'neutral'}>
                        {DIRECTION_LABELS[transaction.direction] || transaction.direction}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {parseFloat(transaction.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${parseFloat(transaction.balance) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {parseFloat(transaction.balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
