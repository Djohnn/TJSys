import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { receiptSchema, type ReceiptFormData } from './inventorySchemas'
import { createMovement } from './inventoryApi'
import type { PaginatedResponse } from './inventoryApi'

export default function ReceiptForm(): ReactNode {
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
  } = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptSchema),
    defaultValues: { product: '', branch: '', location: '', quantity: '', reference: '' },
  })

  const mutation = useMutation({
    mutationFn: (data: ReceiptFormData) =>
      createMovement(
        tenantId,
        { ...data, reference: data.reference || '' },
        idempotencyKey.current,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balances', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['movements', tenantId] })
      navigate('/inventory/movements')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        for (const [field, messages] of Object.entries(err.problem.errors)) {
          setError(field as keyof ReceiptFormData, { message: messages.join(', ') })
        }
      }
    },
  })

  const branches = branchesData?.results ?? []

  return (
    <div data-testid="receipt-form">
      <h2>Entrada de Estoque</h2>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
      >
        <div>
          <label htmlFor="receipt-product">Produto</label>
          <input id="receipt-product" {...register('product')} placeholder="Buscar produto..." />
          {errors.product && <span role="alert" style={{ color: 'red' }}>{errors.product.message}</span>}
        </div>

        <div>
          <label htmlFor="receipt-branch">Filial</label>
          <select id="receipt-branch" {...register('branch')}>
            <option value="">Selecione...</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {errors.branch && <span role="alert" style={{ color: 'red' }}>{errors.branch.message}</span>}
        </div>

        <div>
          <label htmlFor="receipt-location">Localização</label>
          <input id="receipt-location" {...register('location')} />
          {errors.location && <span role="alert" style={{ color: 'red' }}>{errors.location.message}</span>}
        </div>

        <div>
          <label htmlFor="receipt-quantity">Quantidade</label>
          <input id="receipt-quantity" {...register('quantity')} />
          {errors.quantity && <span role="alert" style={{ color: 'red' }}>{errors.quantity.message}</span>}
        </div>

        <div>
          <label htmlFor="receipt-reference">Referência</label>
          <input id="receipt-reference" {...register('reference')} />
        </div>

        <div>
          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Registrando...' : 'Registrar Entrada'}
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
