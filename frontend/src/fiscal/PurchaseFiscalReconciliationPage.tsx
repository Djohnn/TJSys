import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { validateFiscalReceipt } from './fiscalApi'
import type { ValidateFiscalResult } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'

export default function PurchaseFiscalReconciliationPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
  const [receiptId, setReceiptId] = useState('')
  const [cfop, setCfop] = useState('')
  const [result, setResult] = useState<ValidateFiscalResult | null>(null)
  const [message, setMessage] = useState('')

  const validateMut = useMutation({
    mutationFn: () => validateFiscalReceipt(receiptId, cfop, tenantId),
    onSuccess: (data) => {
      setResult(data)
      setMessage('Validação concluída.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  return (
    <div data-testid="purchase-fiscal-reconciliation-page">
      <h2>Reconciliação Fiscal de Compras</h2>
      {message && <p data-testid="reconciliation-message">{message}</p>}

      <div data-testid="reconciliation-form">
        <label>
          ID do Recebimento: <input value={receiptId} onChange={e => setReceiptId(e.target.value)} data-testid="reconciliation-receipt-id" />
        </label>
        <label>
          CFOP: <input value={cfop} onChange={e => setCfop(e.target.value)} data-testid="reconciliation-cfop" />
        </label>
        <button type="button" disabled={validateMut.isPending || !receiptId} onClick={() => validateMut.mutate()} data-testid="validate-btn">
          Validar
        </button>
      </div>

      {result && (
        <div data-testid="reconciliation-result">
          <p>Requer atenção: {result.requires_attention ? 'Sim' : 'Não'}</p>
          <p>Criado: {result.created ? 'Sim' : 'Não'}</p>
          <p>Documento: {result.document_id ?? '-'}</p>
          {result.issues.length > 0 && <ul data-testid="reconciliation-issues">{result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
          {result.warnings.length > 0 && <ul data-testid="reconciliation-warnings">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}