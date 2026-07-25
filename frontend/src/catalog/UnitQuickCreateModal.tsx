import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createUnit } from './catalogApi'

interface Props {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function UnitQuickCreateModal({ open, tenantId, onClose }: Props): ReactNode {
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: { symbol: string; name: string }) => createUnit(tenantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setSymbol('')
      setName('')
      setError('')
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao criar unidade.')
    },
  })

  if (!open) return null

  return (
    <div data-testid="unit-quick-create-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div data-testid="unit-quick-create-modal" className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Nova Unidade</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="quick-unit-symbol" className="block text-sm font-medium text-neutral-700 mb-1">Símbolo</label>
            <input id="quick-unit-symbol" value={symbol} onChange={e => setSymbol(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="UN" maxLength={12} data-testid="quick-unit-symbol-input" />
          </div>
          <div>
            <label htmlFor="quick-unit-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
            <input id="quick-unit-name" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Unidade" data-testid="quick-unit-name-input" />
          </div>
          {error && <p className="text-sm text-danger" data-testid="quick-unit-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer" data-testid="quick-unit-cancel">
              Cancelar
            </button>
            <button type="button" onClick={() => mutation.mutate({ symbol, name })} disabled={mutation.isPending || !symbol.trim() || !name.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer" data-testid="quick-unit-submit">
              {mutation.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
