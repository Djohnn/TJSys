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
    <div data-testid="transfer-form">
      <h2>Transferência de Estoque</h2>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
      >
        <div>
          <label htmlFor="transfer-product">Produto</label>
          <input id="transfer-product" {...register('product')} placeholder="Buscar produto..." />
          {errors.product && <span role="alert" style={{ color: 'red' }}>{errors.product.message}</span>}
        </div>

        <div>
          <label htmlFor="transfer-source">Filial Origem</label>
          <select id="transfer-source" {...register('source_branch')}>
            <option value="">Selecione...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {errors.source_branch && <span role="alert" style={{ color: 'red' }}>{errors.source_branch.message}</span>}
        </div>

        <div>
          <label htmlFor="transfer-destination">Filial Destino</label>
          <select id="transfer-destination" {...register('destination_branch')}>
            <option value="">Selecione...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {errors.destination_branch && <span role="alert" style={{ color: 'red' }}>{errors.destination_branch.message}</span>}
        </div>

        <div>
          <label htmlFor="transfer-quantity">Quantidade</label>
          <input id="transfer-quantity" {...register('quantity')} />
          {errors.quantity && <span role="alert" style={{ color: 'red' }}>{errors.quantity.message}</span>}
        </div>

        <div>
          <label htmlFor="transfer-reason">Motivo</label>
          <input id="transfer-reason" {...register('reason')} />
          {errors.reason && <span role="alert" style={{ color: 'red' }}>{errors.reason.message}</span>}
        </div>

        <div>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Transferindo...' : 'Realizar Transferência'}
          </button>
        </div>

        {mutation.isError && isApiProblemError(mutation.error) && !mutation.error.problem.errors && (
          <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
            {mutation.error.problem.detail}
          </div>
        )}
      </form>
    </div>
  )
}
