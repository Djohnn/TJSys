import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createCategory } from './catalogApi'

interface Props {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function CategoryQuickCreateModal({ open, tenantId, onClose }: Props): ReactNode {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (categoryName: string) => createCategory(tenantId, { name: categoryName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setName('')
      setError('')
      onClose()
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Erro ao criar categoria.')
    },
  })

  if (!open) return null

  return (
    <div data-testid="category-quick-create-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div data-testid="category-quick-create-modal" className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Nova Categoria</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="quick-cat-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
            <input id="quick-cat-name" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Nome da categoria" data-testid="quick-cat-name-input" />
          </div>
          {error && <p className="text-sm text-danger" data-testid="quick-cat-error">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-neutral-50 cursor-pointer" data-testid="quick-cat-cancel">
              Cancelar
            </button>
            <button type="button" onClick={() => mutation.mutate(name)} disabled={mutation.isPending || !name.trim()}
              className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 cursor-pointer" data-testid="quick-cat-submit">
              {mutation.isPending ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
