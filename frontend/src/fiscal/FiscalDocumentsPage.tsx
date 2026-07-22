import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { listDocuments } from './fiscalApi'
import type { FiscalDocument, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', QUEUED: 'Na fila', PROCESSING: 'Processando',
  CONCLUDED: 'Concluído', REJECTED: 'Rejeitado', CANCELLED: 'Cancelado', FAILED: 'Falha',
}

export default function FiscalDocumentsPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
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
    <div data-testid="fiscal-documents-page">
      <h2>Documentos Fiscais</h2>

      <div data-testid="documents-filters">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} data-testid="filter-status">
          <option value="">Todos status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={directionFilter} onChange={e => { setDirectionFilter(e.target.value); setPage(1) }} data-testid="filter-direction">
          <option value="">Todas direções</option>
          <option value="OUTPUT">Saída</option>
          <option value="INPUT">Entrada</option>
        </select>
      </div>

      <table data-testid="documents-table">
        <thead>
          <tr><th>Status</th><th>Direção</th><th>Tentativa</th><th>Protocolo</th><th>Data</th></tr>
        </thead>
        <tbody>
          {data?.results.map(doc => (
            <tr key={doc.id} data-testid="document-row">
              <td><span data-testid={`doc-status-${doc.id}`}>{STATUS_LABELS[doc.status] ?? doc.status}</span></td>
              <td>{doc.direction === 'OUTPUT' ? 'Saída' : 'Entrada'}</td>
              <td>{doc.attempt_number}</td>
              <td>{doc.protocol || '-'}</td>
              <td>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</td>
              <td><Link to={`/fiscal/documents/${doc.id}`} data-testid={`doc-link-${doc.id}`}>Detalhes</Link></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div data-testid="pagination">
        {data?.previous && <button type="button" onClick={() => setPage(p => p - 1)} data-testid="prev-page">Anterior</button>}
        {data?.next && <button type="button" onClick={() => setPage(p => p + 1)} data-testid="next-page">Próximo</button>}
      </div>
    </div>
  )
}