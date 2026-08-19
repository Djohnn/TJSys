import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { generateReport, fetchReports } from './financialApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export default function ReportsPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [reportType, setReportType] = useState<'receivables' | 'payables' | 'cashflow' | 'trial_balance'>('receivables')
  const [format, setFormat] = useState<'PDF' | 'CSV'>('PDF')
  const [error, setError] = useState<string | null>(null)

  const { data: reportsData, isLoading: reportsLoading, isError: reportsError } = useQuery({
    queryKey: ['financial-reports', tenantId],
    queryFn: ({ signal }) => fetchReports(tenantId, signal),
    enabled: !!tenantId,
  })

  const generateMutation = useMutation({
    mutationFn: () => {
      const idempotencyKey = generateIdempotencyKey()
      return generateReport(tenantId, {
        period_start: periodStart,
        period_end: periodEnd,
        type: reportType,
        format,
      }, idempotencyKey)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-reports', tenantId] })
      setPeriodStart('')
      setPeriodEnd('')
      setError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        const messages = err.problem.errors
          ? Object.values(err.problem.errors).flat().join(', ')
          : err.problem.detail
        setError(messages || 'Erro ao gerar relatório.')
      } else {
        setError('Erro ao gerar relatório.')
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    generateMutation.mutate()
  }

  const reports = reportsData?.results ?? []

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'
  const labelClass = 'block text-sm font-medium text-neutral-700 mb-1'

  return (
    <div data-testid="reports-page">
      <Card title="Relatórios">
        <div className="space-y-6">
          <div data-testid="report-generate-form">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Gerar Relatório</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="report-period-start" className={labelClass}>Período início</label>
                  <input
                    id="report-period-start"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                    data-testid="report-period-start"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="report-period-end" className={labelClass}>Período fim</label>
                  <input
                    id="report-period-end"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                    data-testid="report-period-end"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="report-type" className={labelClass}>Tipo</label>
                  <select
                    id="report-type"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as 'receivables' | 'payables' | 'cashflow' | 'trial_balance' | 'dre')}
                    data-testid="report-type"
                    className={inputClass}
                  >
                    <option value="receivables">Recebíveis</option>
                    <option value="payables">Contas a Pagar</option>
                    <option value="cashflow">Fluxo de Caixa</option>
                    <option value="trial_balance">Balanço</option>
                    <option value="dre">DRE</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="report-format" className={labelClass}>Formato</label>
                  <select
                    id="report-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as 'PDF' | 'CSV')}
                    data-testid="report-format"
                    className={inputClass}
                  >
                    <option value="PDF">PDF</option>
                    <option value="CSV">CSV</option>
                  </select>
                </div>
              </div>

              {error && (
                <p data-testid="report-generate-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={generateMutation.isPending || !periodStart || !periodEnd}
                loading={generateMutation.isPending}
                data-testid="generate-report-btn"
              >
                {generateMutation.isPending ? 'Gerando...' : 'Gerar Relatório'}
              </Button>
            </form>
          </div>

          <div data-testid="reports-list" className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Relatórios Anteriores</h3>

            {reportsLoading && <LoadingState message="Carregando relatórios..." />}
            {reportsError && <p data-testid="error-state">Erro ao carregar relatórios.</p>}

            {!reportsLoading && !reportsError && reports.length === 0 && (
              <EmptyState title="Nenhum relatório" description="Nenhum relatório gerado ainda." />
            )}

            {!reportsLoading && !reportsError && reports.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table data-testid="reports-table" className="w-full text-sm">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-border">
                      <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Tipo</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Formato</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Período</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report.id} data-testid="report-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                        <td className="px-4 py-3 text-neutral-700">{report.type}</td>
                        <td className="px-4 py-3 text-neutral-700">{report.format}</td>
                        <td className="px-4 py-3 text-neutral-700">
                          {new Date(report.period_start).toLocaleDateString('pt-BR')} - {new Date(report.period_end).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={report.status === 'completed' ? 'success' : 'warning'}>
                            {report.status === 'completed' ? 'Concluído' : report.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {report.file_url ? (
                            <a href={report.file_url} data-testid="report-download-link" download className="text-primary-600 hover:text-primary-700 font-medium">
                              Download
                            </a>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
