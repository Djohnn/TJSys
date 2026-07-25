import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createCategory } from './catalogApi'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface CategoryQuickCreateModalProps {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function CategoryQuickCreateModal({ open, tenantId, onClose }: CategoryQuickCreateModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

const mutation = useMutation({
    mutationFn: (categoryName: string) => createCategory(tenantId, { name: categoryName }),
    onSuccess: (newCategory) => {
      queryClient.setQueryData(['categories', tenantId], (old: unknown) => {
        if (old && typeof old === 'object' && 'results' in old) {
          const data = old as { results: unknown[] }
          return { ...data, results: [newCategory, ...data.results] }
        }
        return old
      })
      setName('')
      setError('')
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { problem?: { detail?: string } })?.problem?.detail ?? 'Erro ao criar categoria.'
      setError(msg)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  function handleClose() {
    setName('')
    setError(null)
    mutation.reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Nova Categoria"
      onClose={handleClose}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            type="submit"
            form="quick-create-category-form"
            disabled={!name.trim() || mutation.isPending}
            loading={mutation.isPending}
          >
            Criar
          </Button>
        </>
      }
    >
      <form id="quick-create-category-form" onSubmit={handleSubmit}>
        {error && (
          <div role="alert" data-testid="quick-create-category-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="quick-category-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
          <input
            id="quick-category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="quick-create-category-input"
            autoFocus
          />
        </div>
      </form>
    </Modal>
  )
}
