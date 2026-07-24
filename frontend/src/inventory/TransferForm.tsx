import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { transferSchema, type TransferFormData } from './inventorySchemas'
import { createMovement } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function TransferForm(): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const idempotencyKey = useRef(crypto.randomUUID())

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<{ id: string; name: string }>>('/branches/', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<{ id: string; name: string }>>,
    enabled: !!tenantId,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: { product: '', source_branch: '', destination_branch: '', quantity: '', reason: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: TransferFormData) =>
      createMovement(tenantId, data, idempotencyKey.current),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['movements', tenantId] })
      navigate('/inventory/movements')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        for (const [field, messages] of Object.entries(err.problem.errors)) {
          setError(field as keyof TransferFormData, { message: messages.join(', ') })
        }
      }
    },
  })

  const branches = branchesData?.results ?? []

  return (
    <div data-testid="transfer-form" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Transferência de Estoque</h2>
      <Card>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
        >
          <div>
            <label htmlFor="transfer-product" className="block text-sm font-medium text-neutral-700 mb-1">Produto</label>
            <input id="transfer-product" {...register('product')} placeholder="Buscar produto..." className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.product && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.product.message}</span>}
          </div>

          <div>
            <label htmlFor="transfer-source" className="block text-sm font-medium text-neutral-700 mb-1">Filial Origem</label>
            <select id="transfer-source" {...register('source_branch')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.source_branch && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.source_branch.message}</span>}
          </div>

          <div>
            <label htmlFor="transfer-destination" className="block text-sm font-medium text-neutral-700 mb-1">Filial Destino</label>
            <select id="transfer-destination" {...register('destination_branch')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.destination_branch && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.destination_branch.message}</span>}
          </div>

          <div>
            <label htmlFor="transfer-quantity" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade</label>
            <input id="transfer-quantity" {...register('quantity')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.quantity && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.quantity.message}</span>}
          </div>

          <div>
            <label htmlFor="transfer-reason" className="block text-sm font-medium text-neutral-700 mb-1">Motivo</label>
            <input id="transfer-reason" {...register('reason')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.reason && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.reason.message}</span>}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending}>
              {mutation.isPending ? 'Transferindo...' : 'Realizar Transferência'}
            </Button>
          </div>

          {mutation.isError && isApiProblemError(mutation.error) && !mutation.error.problem.errors && (
            <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {mutation.error.problem.detail}
            </div>
          )}
        </form>
      </Card>
    </div>
  )
}
