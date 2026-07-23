import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDocument, retryDocument, cancelDocument, downloadDocumentXml, downloadDocumentPdf } from './fiscalApi'
import type { FiscalDocument } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente', QUEUED: 'Na fila', PROCESSING: 'Processando',
  CONCLUDED: 'Concluído', REJECTED: 'Rejeitado', CANCELLED: 'Cancelado', FAILED: 'Falha',
}

export default function FiscalDocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
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
    <div data-testid="fiscal-document-detail-page">
      <h2>Documento Fiscal</h2>
      {message && <p data-testid="detail-message">{message}</p>}

      <div data-testid="document-info">
        <p>Status: <span data-testid="doc-detail-status">{STATUS_LABELS[doc.status] ?? doc.status}</span></p>
        <p>Direção: {doc.direction === 'OUTPUT' ? 'Saída' : 'Entrada'}</p>
        <p>Tentativa: {doc.attempt_number}</p>
        <p>CFOP: {doc.cfop}</p>
        <p>Protocolo: {doc.protocol || '-'}</p>
        <p>Erro: {doc.error_detail || '-'}</p>
      </div>

      {doc.timeline && doc.timeline.length > 0 && (
        <div data-testid="document-timeline">
          <h3>Histórico</h3>
          <ul>
            {doc.timeline.map((t, i) => (
              <li key={i} data-testid={`timeline-entry-${i}`}>{t.status} — {new Date(t.created_at).toLocaleString('pt-BR')}</li>
            ))}
          </ul>
        </div>
      )}

      <div data-testid="document-actions">
        {canRetry && (
          <>
            <button type="button" onClick={() => setShowRetry(true)} data-testid="retry-btn">Retentar</button>
            {showRetry && (
              <div data-testid="retry-dialog">
                <label>Motivo: <input value={reason} onChange={e => setReason(e.target.value)} data-testid="retry-reason" /></label>
                <button type="button" disabled={retryMut.isPending || !reason} onClick={() => retryMut.mutate()} data-testid="retry-confirm-btn">Confirmar Retry</button>
                <button type="button" onClick={() => { setShowRetry(false); setReason('') }} data-testid="retry-cancel-btn">Cancelar</button>
              </div>
            )}
          </>
        )}
        {canCancel && (
          <>
            <button type="button" onClick={() => setShowCancel(true)} data-testid="cancel-btn">Cancelar</button>
            {showCancel && (
              <div data-testid="cancel-dialog">
                <label>Motivo: <input value={reason} onChange={e => setReason(e.target.value)} data-testid="cancel-reason" /></label>
                <button type="button" disabled={cancelMut.isPending || !reason} onClick={() => cancelMut.mutate()} data-testid="cancel-confirm-btn">Confirmar Cancelamento</button>
                <button type="button" onClick={() => { setShowCancel(false); setReason('') }} data-testid="cancel-cancel-btn">Cancelar</button>
              </div>
            )}
          </>
        )}
      </div>

      <div data-testid="document-downloads">
        {canXml && <button type="button" onClick={handleXmlDownload} data-testid="xml-download-link">Baixar XML</button>}
        {canPdf && <button type="button" onClick={handlePdfDownload} data-testid="pdf-download-link">Baixar PDF</button>}
      </div>
    </div>
  )
}