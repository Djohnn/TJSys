import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { createUnit } from './catalogApi'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface UnitQuickCreateModalProps {
  open: boolean
  tenantId: string
  onClose: () => void
}

export default function UnitQuickCreateModal({ open, tenantId, onClose }: UnitQuickCreateModalProps) {
  const queryClient = useQueryClient()
  const [symbol, setSymbol] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createUnit(tenantId, { symbol, name }),
    onSuccess: (newUnit: unknown) => {
      queryClient.setQueryData(['units', tenantId], (old: unknown) => {
        if (old && typeof old === 'object' && 'results' in old) {
          const data = old as { results: unknown[] }
          return { ...data, results: [newUnit, ...data.results] }
        }
        return old
      })
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  function handleClose() {
    setSymbol('')
    setName('')
    setError(null)
    mutation.reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      title="Nova Unidade"
      onClose={handleClose}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            type="submit"
            form="quick-create-unit-form"
            disabled={!symbol.trim() || !name.trim() || mutation.isPending}
            loading={mutation.isPending}
          >
            Criar
          </Button>
        </>
      }
    >
      <form id="quick-create-unit-form" onSubmit={handleSubmit}>
        {error && (
          <div role="alert" data-testid="quick-create-unit-error" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="quick-unit-symbol" className="block text-sm font-medium text-neutral-700 mb-1">Símbolo</label>
            <input
              id="quick-unit-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              data-testid="quick-create-unit-symbol-input"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="quick-unit-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
            <input
              id="quick-unit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              data-testid="quick-create-unit-name-input"
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
