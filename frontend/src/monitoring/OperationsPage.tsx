import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import MetricCard from './MetricCard'
import RunbookLink from './RunbookLink'
import { fetchOperations, type OperationsData } from './monitoringApi'
import { useVisibilityRefetch } from './useVisibilityRefetch'

function statusToStatusType(status: string): 'good' | 'warning' | 'critical' {
  if (status === 'healthy' || status === 'ready' || status === 'ok') return 'good'
  if (status === 'degraded' || status === 'down') return 'warning'
  return 'critical'
}

function StatusBadge({ status, testId }: { status: string; testId?: string }): ReactNode {
  const type = statusToStatusType(status)
  let cls = 'badge-good'
  if (type === 'warning') cls = 'badge-warning'
  else if (type === 'critical') cls = 'badge-critical'
  return (
    <span data-testid={testId} className={`status-badge ${cls}`}>
      {status}
    </span>
  )
}

export default function OperationsPage(): ReactNode {
  const { selectedTenant } = useTenant()
  const refetchInterval = useVisibilityRefetch(30_000)

  const { isLoading, error, data } = useQuery<OperationsData>({
    queryKey: ['monitoring', 'operations', selectedTenant?.id],
    queryFn: () => fetchOperations(selectedTenant?.id),
    refetchInterval,
    enabled: !!selectedTenant,
  })

  if (isLoading) {
    return <LoadingState message="Carregando operações…" />
  }

  if (error) {
    return <ErrorState message={(error as Error).message} />
  }

  if (!data) {
    return <ErrorState message="Nenhum dado disponível." />
  }

  const { health, readiness, system_metrics, runbook_links } = data
  const { outbox, fiscal } = system_metrics

  return (
    <div data-testid="operations-page">
      <h1>Operações</h1>

      <section data-testid="health-section">
        <h2>Health</h2>
        <div className="health-summary">
          <StatusBadge status={health.status} testId="health-status-badge" />
          <div className="health-checks">
            <span data-testid="health-db-check">
              Database: <StatusBadge status={health.checks.database} testId="health-db-status" />
            </span>
            <span data-testid="health-cache-check">
              Cache: <StatusBadge status={health.checks.cache} testId="health-cache-status" />
            </span>
          </div>
        </div>
      </section>

      <section data-testid="readiness-section">
        <h2>Readiness</h2>
        <div className="readiness-summary">
          <StatusBadge status={readiness.status} testId="readiness-status-badge" />
          <div className="readiness-services">
            <span data-testid="readiness-db-service">
              Database: <StatusBadge status={readiness.services.database} testId="readiness-db-status" />
            </span>
            <span data-testid="readiness-cache-service">
              Cache: <StatusBadge status={readiness.services.cache} testId="readiness-cache-status" />
            </span>
          </div>
        </div>
      </section>

      <section data-testid="system-metrics-section">
        <h2>Métricas do Sistema</h2>

        <div className="metrics-group">
          <h3>Outbox</h3>
          <div className="metrics-grid">
            <div data-testid="outbox-pending">
              <MetricCard title="Pendentes" value={outbox.pending} status={outbox.pending > 10 ? 'warning' : 'good'} />
            </div>
            <div data-testid="outbox-failed">
              <MetricCard title="Falhas" value={outbox.failed} status={outbox.failed > 0 ? 'critical' : 'good'} />
            </div>
            <MetricCard title="Total" value={outbox.total} />
            <MetricCard title="Publicados" value={outbox.published} />
            <MetricCard title="Dead Letter" value={outbox.dead_letter} status={outbox.dead_letter > 0 ? 'warning' : 'good'} />
          </div>
        </div>

        <div className="metrics-group">
          <h3>Fiscal</h3>
          <div className="metrics-grid">
            <div data-testid="fiscal-pending">
              <MetricCard title="Pendentes" value={fiscal.pending} status={fiscal.pending > 10 ? 'warning' : 'good'} />
            </div>
            <div data-testid="fiscal-processing">
              <MetricCard title="Processando" value={fiscal.processing} />
            </div>
            <div data-testid="fiscal-concluded">
              <MetricCard title="Concluídos" value={fiscal.concluded} status="good" />
            </div>
            <div data-testid="fiscal-rejected">
              <MetricCard title="Rejeitados" value={fiscal.rejected} status={fiscal.rejected > 0 ? 'critical' : 'good'} />
            </div>
            <MetricCard title="Cancelados" value={fiscal.cancelled} />
            <MetricCard title="Falhas" value={fiscal.failed} status={fiscal.failed > 0 ? 'critical' : 'good'} />
            <MetricCard title="Total" value={fiscal.total} />
          </div>
        </div>
      </section>

      <section data-testid="runbook-section">
        <h2>Runbooks</h2>
        <div className="runbook-grid">
          {runbook_links.map((link) => (
            <RunbookLink key={link.id} label={link.label} url={link.url} testId={`runbook-link-${link.id}`} />
          ))}
        </div>
      </section>
    </div>
  )
}