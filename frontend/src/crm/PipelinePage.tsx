import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './crmApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface PipelineStage {
  id: string
  name: string
  description: string
  order: number
  color: string
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

export interface Pipeline {
  id: string
  name: string
  description: string
  is_default: boolean
  is_active: boolean
  stages: PipelineStage[]
  created_at: string
  updated_at: string
}

export interface Opportunity {
  id: string
  pipeline: string
  pipeline_name: string
  stage: string
  stage_name: string
  customer: string
  customer_name: string
  assigned_to: string | null
  assigned_to_name: string
  title: string
  description: string
  value: string
  currency: string
  probability: number
  expected_close_date: string | null
  actual_close_date: string | null
  status: string
  lost_reason: string
  source: string
  notes: string
  converted_sale: string | null
  created_at: string
  updated_at: string
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Em aberto',
  won: 'Ganha',
  lost: 'Perdida',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  open: 'warning',
  won: 'success',
  lost: 'danger',
}

export default function PipelinePage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['pipelines', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Pipeline>>('/crm/pipelines/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Pipeline>>,
    enabled: !!tenantId,
  })

  const { data: opportunitiesData, isLoading: opportunitiesLoading, isError } = useQuery({
    queryKey: ['opportunities', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Opportunity>>(`/crm/opportunities/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Opportunity>>,
    enabled: !!tenantId,
  })

  if (pipelinesLoading || opportunitiesLoading) return <LoadingState message="Carregando pipeline..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar oportunidades.</p>

  const pipelines = pipelinesData?.results ?? []
  const opportunities = opportunitiesData?.results ?? []
  const totalPages = opportunitiesData ? Math.ceil(opportunitiesData.count / 25) : 1

  return (
    <div data-testid="pipeline-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Pipeline de Vendas</h2>
      </div>

      {pipelines.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines.map((pipeline) => (
            <Card key={pipeline.id} data-testid="pipeline-card">
              <div className="p-4">
                <h3 className="text-lg font-semibold text-neutral-900">{pipeline.name}</h3>
                <p className="text-sm text-neutral-600 mt-1">{pipeline.description || 'Sem descrição'}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant={pipeline.is_default ? 'success' : 'neutral'}>
                    {pipeline.is_default ? 'Padrão' : 'Personalizado'}
                  </Badge>
                  <span className="text-sm text-neutral-500">{pipeline.stages?.length || 0} estágios</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por título..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="opportunity-search-input"
          />
        </div>
      )}

      {opportunities.length === 0 && (
        <EmptyState
          title="Nenhuma oportunidade"
          description="Crie uma oportunidade para começar."
        />
      )}

      {opportunities.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="opportunities-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Título</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Estágio</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Probabilidade</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Previsão</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opportunity) => (
                  <tr key={opportunity.id} data-testid="opportunity-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{opportunity.title}</td>
                    <td className="px-4 py-3 text-neutral-700">{opportunity.customer_name}</td>
                    <td className="px-4 py-3 text-neutral-700">{opportunity.stage_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANTS[opportunity.status] || 'neutral'}>
                        {STATUS_LABELS[opportunity.status] || opportunity.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">R$ {opportunity.value}</td>
                    <td className="px-4 py-3 text-neutral-700">{opportunity.probability}%</td>
                    <td className="px-4 py-3 text-neutral-700">{opportunity.expected_close_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
