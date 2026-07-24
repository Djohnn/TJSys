import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { validateFiscalReceipt } from './fiscalApi'
import type { ValidateFiscalResult } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

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
    <div data-testid="purchase-fiscal-reconciliation-page" className="p-6">
      <Card title="Reconciliação Fiscal de Compras">
        {message && <p data-testid="reconciliation-message" className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{message}</p>}

        <div data-testid="reconciliation-form" className="flex flex-wrap items-end gap-3 mb-6">
          <label className="text-sm font-medium text-neutral-700">
            ID do Recebimento:
            <input value={receiptId} onChange={e => setReceiptId(e.target.value)} data-testid="reconciliation-receipt-id" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </label>
          <label className="text-sm font-medium text-neutral-700">
            CFOP:
            <input value={cfop} onChange={e => setCfop(e.target.value)} data-testid="reconciliation-cfop" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </label>
          <Button variant="primary" size="sm" disabled={validateMut.isPending || !receiptId} onClick={() => validateMut.mutate()} data-testid="validate-btn">
            Validar
          </Button>
        </div>

        {result && (
          <div data-testid="reconciliation-result" className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <p className="text-neutral-700">Requer atenção: <Badge variant={result.requires_attention ? 'danger' : 'success'}>{result.requires_attention ? 'Sim' : 'Não'}</Badge></p>
              <p className="text-neutral-700">Criado: <Badge variant={result.created ? 'success' : 'warning'}>{result.created ? 'Sim' : 'Não'}</Badge></p>
              <p className="text-neutral-700">Documento: {result.document_id ?? '-'}</p>
            </div>
            {result.issues.length > 0 && (
              <div>
                <p className="font-semibold text-danger mb-1">Issues:</p>
                <ul data-testid="reconciliation-issues" className="list-disc list-inside text-danger space-y-0.5">
                  {result.issues.map((issue, i) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div>
                <p className="font-semibold text-yellow-700 mb-1">Warnings:</p>
                <ul data-testid="reconciliation-warnings" className="list-disc list-inside text-yellow-700 space-y-0.5">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}