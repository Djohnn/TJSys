import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createBrand } from './catalogApi'
import { catalogKeys } from './catalogQueryKeys'

interface BrandQuickCreateModalProps {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function BrandQuickCreateModal({ open, tenantId, onClose }: BrandQuickCreateModalProps): ReactNode {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (brandName: string) => createBrand(tenantId, { name: brandName }),
    onSuccess: (newBrand) => {
      const updater = (old: unknown) => {
        if (old && typeof old === 'object' && 'results' in old) {
          const data = old as { results: unknown[] }
          return { ...data, results: [newBrand, ...data.results] }
        }
        return old
      }
      queryClient.setQueryData(catalogKeys.brands(tenantId), updater)
      queryClient.setQueryData([...catalogKeys.brands(tenantId), 1], updater)
      setName('')
      setError(null)
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { problem?: { detail?: string } })?.problem?.detail ?? 'Erro ao criar marca.'
      setError(msg)
    },
  })

  function handleCreate() {
    setError(null)
    mutation.mutate(name.trim())
  }

  if (!open) return null

  return (
    <div data-testid="brand-quick-create-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div data-testid="brand-quick-create-modal" className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Nova Marca</h3>
        {error && (
          <div role="alert" data-testid="quick-create-brand-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="quick-brand-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
            <input id="quick-brand-name" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Nome da marca"
              data-testid="quick-brand-name-input" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
              data-testid="quick-brand-cancel">Cancelar</button>
            <button type="button" onClick={handleCreate} disabled={mutation.isPending || !name.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
              data-testid="quick-brand-submit">
              {mutation.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
