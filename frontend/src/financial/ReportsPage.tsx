import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { generateReport, fetchReports } from './financialApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

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

  return (
    <div data-testid="reports-page">
      <h2>Relatórios</h2>

      <div data-testid="report-generate-form">
        <h3>Gerar Relatório</h3>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="report-period-start">Período início</label>
            <input
              id="report-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              required
              data-testid="report-period-start"
            />
          </div>
          <div>
            <label htmlFor="report-period-end">Período fim</label>
            <input
              id="report-period-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              required
              data-testid="report-period-end"
            />
          </div>
          <div>
            <label htmlFor="report-type">Tipo</label>
            <select
              id="report-type"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as 'receivables' | 'payables' | 'cashflow' | 'trial_balance')}
              data-testid="report-type"
            >
              <option value="receivables">Recebíveis</option>
              <option value="payables">Contas a Pagar</option>
              <option value="cashflow">Fluxo de Caixa</option>
              <option value="trial_balance">Balanço</option>
            </select>
          </div>
          <div>
            <label htmlFor="report-format">Formato</label>
            <select
              id="report-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'PDF' | 'CSV')}
              data-testid="report-format"
            >
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          {error && <p data-testid="report-generate-error" style={{ color: '#dc2626' }}>{error}</p>}
          <button type="submit" disabled={generateMutation.isPending || !periodStart || !periodEnd} data-testid="generate-report-btn">
            {generateMutation.isPending ? 'Gerando...' : 'Gerar Relatório'}
          </button>
        </form>
      </div>

      <div data-testid="reports-list">
        <h3>Relatórios Anteriores</h3>
        {reportsLoading && <LoadingState message="Carregando relatórios..." />}
        {reportsError && <p data-testid="error-state">Erro ao carregar relatórios.</p>}
        {!reportsLoading && !reportsError && reports.length === 0 && (
          <EmptyState title="Nenhum relatório" description="Nenhum relatório gerado ainda." />
        )}
        {!reportsLoading && !reportsError && reports.length > 0 && (
          <table data-testid="reports-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Formato</th>
                <th>Período</th>
                <th>Status</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} data-testid="report-row">
                  <td>{report.type}</td>
                  <td>{report.format}</td>
                  <td>{new Date(report.period_start).toLocaleDateString('pt-BR')} - {new Date(report.period_end).toLocaleDateString('pt-BR')}</td>
                  <td>{report.status === 'completed' ? 'Concluído' : report.status}</td>
                  <td>
                    {report.file_url ? (
                      <a href={report.file_url} data-testid="report-download-link" download>Download</a>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
