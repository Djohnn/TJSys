import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listDocuments } from './fiscalApi'
import type { FiscalDocument, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', QUEUED: 'Na fila', PROCESSING: 'Processando',
  CONCLUDED: 'Concluído', REJECTED: 'Rejeitado', CANCELLED: 'Cancelado', FAILED: 'Falha',
}

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  PENDING: 'warning',
  QUEUED: 'info',
  PROCESSING: 'info',
  CONCLUDED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  FAILED: 'danger',
}

export default function FiscalDocumentsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedResponse<FiscalDocument>>({
    queryKey: ['fiscal-documents', tenantId, page, statusFilter, directionFilter],
    queryFn: () => listDocuments({ status: statusFilter || undefined, direction: directionFilter || undefined, page, tenantId }),
    enabled: !!tenantId,
  })

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar documentos.</p>

  return (
    <div data-testid="fiscal-documents-page" className="p-6">
      <Card title="Documentos Fiscais">
        <div data-testid="documents-filters" className="mb-4 flex items-center gap-3">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} data-testid="filter-status" className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setPage(1) }} data-testid="filter-direction" className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Todas direções</option>
            <option value="OUTPUT">Saída</option>
            <option value="INPUT">Entrada</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="documents-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Direção</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Tentativa</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Protocolo</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Data</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(doc => (
                <tr key={doc.id} data-testid="document-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[doc.status] ?? 'neutral'} testId={`doc-status-${doc.id}`}>
                      {STATUS_LABELS[doc.status] ?? doc.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{doc.direction === 'OUTPUT' ? 'Saída' : 'Entrada'}</td>
                  <td className="px-4 py-3 text-neutral-700">{doc.attempt_number}</td>
                  <td className="px-4 py-3 text-neutral-700">{doc.protocol || '-'}</td>
                  <td className="px-4 py-3 text-neutral-700">{new Date(doc.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <Link to={`/app/fiscal/documents/${doc.id}`} data-testid={`doc-link-${doc.id}`} className="text-primary-600 hover:text-primary-700 font-medium text-sm">Detalhes</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div data-testid="pagination" className="mt-4 flex items-center gap-2">
          {data?.previous && <Button variant="secondary" size="sm" onClick={() => setPage(p => p - 1)} data-testid="prev-page">Anterior</Button>}
          {data?.next && <Button variant="secondary" size="sm" onClick={() => setPage(p => p + 1)} data-testid="next-page">Próximo</Button>}
        </div>
      </Card>
    </div>
  )
}
