import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { fetchDREReport } from './reportsApi'
import LoadingState from '@/components/LoadingState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

function formatCurrency(value: string): string {
  try {
    return new Decimal(value).toFixed(2)
  } catch {
    return value
  }
}

function DRELineRow({ label, value, percentage, level = 0 }: { label: string; value: string; percentage?: string; level?: number }) {
  const isSubtotal = level === 0
  return (
    <tr className={isSubtotal ? 'bg-neutral-50 font-semibold' : ''}>
      <td className="px-4 py-3 text-sm text-neutral-900" style={{ paddingLeft: `${(level * 16) + 16}px` }}>
        {label}
      </td>
      <td className="px-4 py-3 text-sm text-right text-neutral-900">
        {formatCurrency(value)}
      </td>
      <td className="px-4 py-3 text-sm text-right text-neutral-500">
        {percentage ? `${percentage}%` : '—'}
      </td>
    </tr>
  )
}

export default function DREPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()

  const dateFrom = searchParams.get('date_from') || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const dateTo = searchParams.get('date_to') || new Date().toISOString().split('T')[0]
  const branchFilter = searchParams.get('branch') || ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dre', tenantId, dateFrom, dateTo, branchFilter],
    queryFn: ({ signal }) =>
      fetchDREReport(tenantId, {
        date_from: dateFrom,
        date_to: dateTo,
        branch: branchFilter || undefined,
      }, signal),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<{ results: { id: string; name: string }[] }>('/branches/', {
        tenantId,
        signal,
      }),
    enabled: !!tenantId,
  })

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setSearchParams(next)
  }

  if (isLoading) return <LoadingState message="Carregando DRE..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar DRE.</p>

  const branches = branchesData?.results ?? []

  return (
    <div data-testid="dre-page">
      <Card title="Demonstração do Resultado do Exercício (DRE)">
        <div data-testid="dre-filters" className="flex flex-wrap items-end gap-4 mb-6">
          <div>
            <label htmlFor="dre-date-from" className="block text-sm font-medium text-neutral-700 mb-1">Data Início</label>
            <input
              id="dre-date-from"
              type="date"
              value={dateFrom}
              onChange={e => setFilter('date_from', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="dre-date-to" className="block text-sm font-medium text-neutral-700 mb-1">Data Fim</label>
            <input
              id="dre-date-to"
              type="date"
              value={dateTo}
              onChange={e => setFilter('date_to', e.target.value)}
              className="block w-40 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="dre-branch" className="block text-sm font-medium text-neutral-700 mb-1">Filial</label>
            <select
              id="dre-branch"
              value={branchFilter}
              onChange={e => setFilter('branch', e.target.value)}
              className="block w-48 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Todas</option>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const today = new Date()
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
                setFilter('date_from', firstDay.toISOString().split('T')[0])
                setFilter('date_to', today.toISOString().split('T')[0])
              }}
            >
              Mês Atual
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const today = new Date()
                const firstDay = new Date(today.getFullYear(), 0, 1)
                setFilter('date_from', firstDay.toISOString().split('T')[0])
                setFilter('date_to', today.toISOString().split('T')[0])
              }}
            >
              Ano Atual
            </Button>
          </div>
        </div>

        {data && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500">Descrição</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500">Valor (R$)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 bg-white">
                <DRELineRow
                  label={data.revenue.label}
                  value={data.revenue.value}
                  percentage={data.revenue.percentage}
                />
                <DRELineRow
                  label={data.deductions.label}
                  value={data.deductions.value}
                  percentage={data.deductions.percentage}
                />
                <DRELineRow
                  label={data.net_revenue.label}
                  value={data.net_revenue.value}
                  percentage={data.net_revenue.percentage}
                />
                <DRELineRow
                  label={data.cost_of_goods.label}
                  value={data.cost_of_goods.value}
                  percentage={data.cost_of_goods.percentage}
                />
                <DRELineRow
                  label={data.gross_profit.label}
                  value={data.gross_profit.value}
                  percentage={data.gross_profit.percentage}
                />
                <DRELineRow
                  label={data.operating_expenses.label}
                  value={data.operating_expenses.value}
                  percentage={data.operating_expenses.percentage}
                />
                <DRELineRow
                  label={data.operating_result.label}
                  value={data.operating_result.value}
                  percentage={data.operating_result.percentage}
                />
                <DRELineRow
                  label={data.result_before_tax.label}
                  value={data.result_before_tax.value}
                  percentage={data.result_before_tax.percentage}
                />
                <DRELineRow
                  label={data.income_tax.label}
                  value={data.income_tax.value}
                  percentage={data.income_tax.percentage}
                />
                <DRELineRow
                  label={data.net_result.label}
                  value={data.net_result.value}
                  percentage={data.net_result.percentage}
                />
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                const params = new URLSearchParams()
                params.set('date_from', dateFrom)
                params.set('date_to', dateTo)
                if (branchFilter) params.set('branch', branchFilter)
                params.set('export', 'csv')
                window.open(`/api/v1/financial/reports/dre/?${params.toString()}`, '_blank')
              }}
            >
              Exportar CSV
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
