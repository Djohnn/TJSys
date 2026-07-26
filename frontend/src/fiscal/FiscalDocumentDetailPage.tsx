import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDocument, retryDocument, cancelDocument, downloadDocumentXml, downloadDocumentPdf } from './fiscalApi'
import type { FiscalDocument } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

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

export default function FiscalDocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id
  const queryClient = useQueryClient()
  const [showRetry, setShowRetry] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')

  const { data: doc, isLoading, isError } = useQuery<FiscalDocument>({
    queryKey: ['fiscal-document', id, tenantId],
    queryFn: () => getDocument(id!, tenantId),
    enabled: !!id && !!tenantId,
  })

  const retryMut = useMutation({
    mutationFn: () => retryDocument(id!, reason, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', id] })
      setShowRetry(false)
      setReason('')
      setMessage('Retentativa iniciada.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelDocument(id!, reason, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-document', id] })
      setShowCancel(false)
      setReason('')
      setMessage('Cancelamento solicitado.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  function handleXmlDownload() {
    if (!id) return
    downloadDocumentXml(id, tenantId)
      .then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `doc-${id}.xml`; a.click() })
      .catch((err: Error) => setMessage(err.message))
  }

  function handlePdfDownload() {
    if (!id) return
    downloadDocumentPdf(id, tenantId)
      .then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `doc-${id}.pdf`; a.click() })
      .catch((err: Error) => setMessage(err.message))
  }

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar documento.</p>
  if (!doc) return <p data-testid="error-state">Documento não encontrado.</p>

  const canRetry = doc.status === 'REJECTED' || doc.status === 'FAILED'
  const canCancel = doc.status === 'PENDING' || doc.status === 'PROCESSING'
  const canXml = doc.status === 'CONCLUDED'
  const canPdf = doc.status === 'CONCLUDED' || doc.status === 'PROCESSING'

  return (
    <div data-testid="fiscal-document-detail-page" className="p-6 space-y-6">
      {message && <p data-testid="detail-message" className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{message}</p>}

      <Card title="Documento Fiscal">
        <div data-testid="document-info" className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <p className="text-neutral-700">
            Status: <Badge variant={STATUS_VARIANTS[doc.status] ?? 'neutral'} testId="doc-detail-status">{STATUS_LABELS[doc.status] ?? doc.status}</Badge>
          </p>
          <p className="text-neutral-700">Direção: {doc.direction === 'OUTPUT' ? 'Saída' : 'Entrada'}</p>
          <p className="text-neutral-700">Tentativa: {doc.attempt_number}</p>
          <p className="text-neutral-700">CFOP: {doc.cfop}</p>
          <p className="text-neutral-700">Protocolo: {doc.protocol || '-'}</p>
          <p className="text-neutral-700">Erro: {doc.error_detail || '-'}</p>
        </div>
      </Card>

      {doc.timeline && doc.timeline.length > 0 && (
        <Card title="Histórico">
          <div data-testid="document-timeline" className="space-y-2">
            {doc.timeline.map((t, i) => (
              <div key={i} data-testid={`timeline-entry-${i}`} className="flex items-center gap-3 text-sm text-neutral-700">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="font-medium">{STATUS_LABELS[t.status] ?? t.status}</span>
                <span className="text-neutral-500">{new Date(t.created_at).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div data-testid="document-actions" className="flex flex-wrap items-center gap-3">
        {canRetry && (
          <>
            <Button variant="primary" size="sm" onClick={() => setShowRetry(true)} data-testid="retry-btn">Retentar</Button>
            {showRetry && (
              <div data-testid="retry-dialog" className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg border border-border">
                <label className="text-sm font-medium text-neutral-700">
                  Motivo:
                  <input value={reason} onChange={e => setReason(e.target.value)} data-testid="retry-reason" className="ml-2 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </label>
                <Button variant="primary" size="sm" disabled={retryMut.isPending || !reason} onClick={() => retryMut.mutate()} data-testid="retry-confirm-btn">Confirmar Retry</Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowRetry(false); setReason('') }} data-testid="retry-cancel-btn">Cancelar</Button>
              </div>
            )}
          </>
        )}
        {canCancel && (
          <>
            <Button variant="danger" size="sm" onClick={() => setShowCancel(true)} data-testid="cancel-btn">Cancelar</Button>
            {showCancel && (
              <div data-testid="cancel-dialog" className="flex items-center gap-2 p-3 bg-neutral-50 rounded-lg border border-border">
                <label className="text-sm font-medium text-neutral-700">
                  Motivo:
                  <input value={reason} onChange={e => setReason(e.target.value)} data-testid="cancel-reason" className="ml-2 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </label>
                <Button variant="danger" size="sm" disabled={cancelMut.isPending || !reason} onClick={() => cancelMut.mutate()} data-testid="cancel-confirm-btn">Confirmar Cancelamento</Button>
                <Button variant="secondary" size="sm" onClick={() => { setShowCancel(false); setReason('') }} data-testid="cancel-cancel-btn">Cancelar</Button>
              </div>
            )}
          </>
        )}
      </div>

      <div data-testid="document-downloads" className="flex items-center gap-3">
        {canXml && <Button variant="secondary" size="sm" onClick={handleXmlDownload} data-testid="xml-download-link">Baixar XML</Button>}
        {canPdf && <Button variant="secondary" size="sm" onClick={handlePdfDownload} data-testid="pdf-download-link">Baixar PDF</Button>}
      </div>
    </div>
  )
}
