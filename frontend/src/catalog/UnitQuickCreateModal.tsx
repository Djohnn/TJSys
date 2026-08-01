import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createUnit } from './catalogApi'
import { catalogKeys } from './catalogQueryKeys'

interface UnitQuickCreateModalProps {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function UnitQuickCreateModal({ open, tenantId, onClose }: UnitQuickCreateModalProps): ReactNode {
  const queryClient = useQueryClient()
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: { symbol: string; name: string }) => createUnit(tenantId, data),
    onSuccess: (newUnit) => {
      const updater = (old: unknown) => {
        if (old && typeof old === 'object' && 'results' in old) {
          const data = old as { results: unknown[] }
          return { ...data, results: [newUnit, ...data.results] }
        }
        return old
      }
      queryClient.setQueryData(catalogKeys.units(tenantId), updater)
      queryClient.setQueryData([...catalogKeys.units(tenantId), 1], updater)
      setSymbol('')
      setName('')
      setError(null)
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { problem?: { detail?: string } })?.problem?.detail ?? 'Erro ao criar unidade.'
      setError(msg)
    },
  })

  function handleCreate() {
    setError(null)
    mutation.mutate({ symbol: symbol.trim().toUpperCase(), name: name.trim() })
  }

  if (!open) return null

  return (
    <div data-testid="unit-quick-create-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div data-testid="unit-quick-create-modal" className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Nova Unidade</h3>
        {error && (
          <div role="alert" data-testid="quick-unit-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="quick-unit-symbol" className="block text-sm font-medium text-neutral-700 mb-1">Símbolo</label>
            <input id="quick-unit-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="UN" maxLength={12}
              data-testid="quick-unit-symbol-input" autoFocus />
          </div>
          <div>
            <label htmlFor="quick-unit-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
            <input id="quick-unit-name" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Unidade"
              data-testid="quick-unit-name-input"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
              data-testid="quick-unit-cancel">Cancelar</button>
            <button type="button" onClick={handleCreate} disabled={mutation.isPending || !symbol.trim() || !name.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
              data-testid="quick-unit-submit">
              {mutation.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
