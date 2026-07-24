import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import MetricCard from './MetricCard'
import RunbookLink from './RunbookLink'
import { fetchOperations, type OperationsData } from './monitoringApi'
import { useVisibilityRefetch } from './useVisibilityRefetch'

function statusToBadgeVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'healthy' || status === 'ready' || status === 'ok') return 'success'
  if (status === 'degraded' || status === 'down') return 'warning'
  return 'danger'
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
    <div data-testid="operations-page" className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Operações</h1>

      <Card title="Health">
        <section data-testid="health-section" className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant={statusToBadgeVariant(health.status)} testId="health-status-badge">{health.status}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-700">
            <span data-testid="health-db-check" className="flex items-center gap-2">
              Database: <Badge variant={statusToBadgeVariant(health.checks.database)} testId="health-db-status">{health.checks.database}</Badge>
            </span>
            <span data-testid="health-cache-check" className="flex items-center gap-2">
              Cache: <Badge variant={statusToBadgeVariant(health.checks.cache)} testId="health-cache-status">{health.checks.cache}</Badge>
            </span>
          </div>
        </section>
      </Card>

      <Card title="Readiness">
        <section data-testid="readiness-section" className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant={statusToBadgeVariant(readiness.status)} testId="readiness-status-badge">{readiness.status}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-700">
            <span data-testid="readiness-db-service" className="flex items-center gap-2">
              Database: <Badge variant={statusToBadgeVariant(readiness.services.database)} testId="readiness-db-status">{readiness.services.database}</Badge>
            </span>
            <span data-testid="readiness-cache-service" className="flex items-center gap-2">
              Cache: <Badge variant={statusToBadgeVariant(readiness.services.cache)} testId="readiness-cache-status">{readiness.services.cache}</Badge>
            </span>
          </div>
        </section>
      </Card>

      <Card title="Métricas do Sistema">
        <section data-testid="system-metrics-section" className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Outbox</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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

          <div>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">Fiscal</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
      </Card>

      <Card title="Runbooks">
        <section data-testid="runbook-section">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {runbook_links.map((link) => (
              <RunbookLink key={link.id} label={link.label} url={link.url} testId={`runbook-link-${link.id}`} />
            ))}
          </div>
        </section>
      </Card>
    </div>
  )
}