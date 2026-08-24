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
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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
      navigate('/app/inventory/movements')
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
    <div data-testid="receipt-form" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Entrada de Estoque</h2>
      <Card>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="space-y-4"
        >
          <div>
            <label htmlFor="receipt-product" className="block text-sm font-medium text-neutral-700 mb-1">Produto</label>
            <input id="receipt-product" {...register('product')} placeholder="Buscar produto..." className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.product && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.product.message}</span>}
          </div>

          <div>
            <label htmlFor="receipt-branch" className="block text-sm font-medium text-neutral-700 mb-1">Filial</label>
            <select id="receipt-branch" {...register('branch')} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.branch && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.branch.message}</span>}
          </div>

          <div>
            <label htmlFor="receipt-location" className="block text-sm font-medium text-neutral-700 mb-1">Localização</label>
            <input id="receipt-location" {...register('location')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.location && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.location.message}</span>}
          </div>

          <div>
            <label htmlFor="receipt-quantity" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade</label>
            <input id="receipt-quantity" {...register('quantity')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
            {errors.quantity && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.quantity.message}</span>}
          </div>

          <div>
            <label htmlFor="receipt-reference" className="block text-sm font-medium text-neutral-700 mb-1">Referência</label>
            <input id="receipt-reference" {...register('reference')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={mutation.isPending} loading={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Registrar Entrada'}
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
