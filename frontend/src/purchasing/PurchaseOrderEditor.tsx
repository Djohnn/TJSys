import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Decimal from 'decimal.js'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse } from '@/organization/organizationApi'
import type { Branch } from '@/organization/organizationApi'
import type { Supplier } from './purchasingApi'
import {
  fetchSuppliers,
  createPurchaseOrder,
  updatePurchaseOrder,
  approvePurchaseOrder,
  fetchPurchaseOrder,
} from './purchasingApi'
import {
  purchaseOrderSchema,
  type PurchaseOrderFormData,
} from './purchasingSchemas'
import LoadingState from '@/components/LoadingState'
import ErrorState from '@/errors/ErrorState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

const STATUS_BADGE_COLOR: Record<string, 'info' | 'success' | 'neutral' | 'danger'> = {
  draft: 'info',
  approved: 'success',
  received: 'neutral',
  cancelled: 'danger',
}

export default function PurchaseOrderEditor() {
  const { selectedTenant } = useTenant()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const isEditing = !!id
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', tenantId, 1, '', ''],
    queryFn: ({ signal }) => fetchSuppliers(tenantId, { page: 1 }, signal),
    enabled: !!tenantId,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Branch>>('/branches/?page=1', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Branch>>,
    enabled: !!tenantId,
  })

  const {
    data: existingOrder,
    isLoading: orderLoading,
    isError: orderError,
  } = useQuery({
    queryKey: ['purchase-order', tenantId, id],
    queryFn: ({ signal }) => fetchPurchaseOrder(tenantId, id!, signal),
    enabled: !!tenantId && isEditing,
  })

  const isApproved = isEditing && existingOrder && existingOrder.status !== 'draft'

  const formDefaultValues: PurchaseOrderFormData = isEditing && existingOrder
    ? {
        supplier: existingOrder.supplier,
        branch: existingOrder.branch,
        items: existingOrder.items.map((i) => ({
          product: i.product,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      }
    : { supplier: '', branch: '', items: [] }

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
  } = useForm<PurchaseOrderFormData>({
    resolver: zodResolver(purchaseOrderSchema),
    values: formDefaultValues,
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = watch('items')

  function computeLineTotal(quantity: string, unitPrice: string): string {
    try {
      const q = new Decimal(quantity || '0')
      const p = new Decimal(unitPrice || '0')
      return q.mul(p).toFixed(2)
    } catch {
      return '0.00'
    }
  }

  function computeGrandTotal(): string {
    if (!watchedItems || watchedItems.length === 0) return '0.00'
    let total = new Decimal(0)
    for (const item of watchedItems) {
      try {
        const q = new Decimal(item.quantity || '0')
        const p = new Decimal(item.unit_price || '0')
        total = total.add(q.mul(p))
      } catch {
        // skip invalid
      }
    }
    return total.toFixed(2)
  }

  const createMutation = useMutation({
    mutationFn: (body: PurchaseOrderFormData) =>
      createPurchaseOrder(tenantId, body, crypto.randomUUID?.() ?? Math.random().toString()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', tenantId] })
      setSuccessMessage('Ordem criada com sucesso!')
      setTimeout(() => navigate(`/app/purchasing/orders/${data.id}`), 500)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar ordem de compra.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: (body: PurchaseOrderFormData) =>
      updatePurchaseOrder(tenantId, id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', tenantId, id] })
      setSuccessMessage('Ordem atualizada com sucesso!')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar ordem de compra.')
      }
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => approvePurchaseOrder(tenantId, id!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', tenantId, id] })
      setSuccessMessage('Ordem aprovada com sucesso!')
      setTimeout(() => navigate(`/app/purchasing/orders/${data.id}`), 500)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao aprovar ordem de compra.')
      }
    },
  })

  function onSubmit(data: PurchaseOrderFormData) {
    setSubmitError(null)
    setSuccessMessage(null)
    if (isEditing) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  function handleApprove() {
    setSubmitError(null)
    setSuccessMessage(null)
    approveMutation.mutate()
  }

  if (isEditing && orderLoading) return <LoadingState message="Carregando ordem..." />
  if (isEditing && orderError) return <ErrorState status={404} message="Ordem não encontrada." />

  const grandTotal = isEditing && existingOrder ? existingOrder.total : computeGrandTotal()
  const suppliers = suppliersData?.results ?? []
  const branches = branchesData?.results ?? []
  const isPending = createMutation.isPending || updateMutation.isPending || approveMutation.isPending

  return (
    <div data-testid="purchase-order-editor" className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-neutral-900">{isEditing ? `Ordem de Compra: ${existingOrder?.number ?? ''}` : 'Nova Ordem de Compra'}</h2>
        {isEditing && existingOrder && (
          <Badge testId="status-badge" variant={STATUS_BADGE_COLOR[existingOrder.status] ?? 'neutral'}>
            {STATUS_LABEL[existingOrder.status] ?? existingOrder.status}
          </Badge>
        )}
      </div>

      {submitError && (
        <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      {successMessage && (
        <div data-testid="success-message" role="status" className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {successMessage}
        </div>
      )}

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="order-supplier" className="block text-sm font-medium text-neutral-700 mb-1">Fornecedor</label>
            <select id="order-supplier" {...register('supplier')} disabled={isApproved} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {suppliers.map((s: Supplier) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {errors.supplier && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.supplier.message}</span>}
          </div>

          <div>
            <label htmlFor="order-branch" className="block text-sm font-medium text-neutral-700 mb-1">Filial</label>
            <select id="order-branch" {...register('branch')} disabled={isApproved} className="w-full px-3 py-2 border border-border rounded-lg text-sm">
              <option value="">Selecione...</option>
              {branches.map((b: Branch) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {errors.branch && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.branch.message}</span>}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Itens</h3>
            {errors.items && (
              <p role="alert" className="text-xs text-red-600 mb-2">{errors.items.message || errors.items.root?.message}</p>
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table data-testid="items-table" className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-border">
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Produto</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Quantidade</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Preço Unitário</th>
                    <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Total</th>
                    {!isApproved && <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => (
                    <tr key={field.id} data-testid="item-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          {...register(`items.${index}.product`)}
                          aria-label="Produto"
                          disabled={isApproved}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                        />
                        {errors.items?.[index]?.product && (
                          <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.items[index]?.product?.message}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          {...register(`items.${index}.quantity`)}
                          aria-label="Quantidade"
                          disabled={isApproved}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                        />
                        {errors.items?.[index]?.quantity && (
                          <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.items[index]?.quantity?.message}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          {...register(`items.${index}.unit_price`)}
                          aria-label="Preço unitário"
                          disabled={isApproved}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                        />
                        {errors.items?.[index]?.unit_price && (
                          <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.items[index]?.unit_price?.message}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {watchedItems?.[index]
                          ? computeLineTotal(watchedItems[index].quantity, watchedItems[index].unit_price)
                          : '0.00'}
                      </td>
                      {!isApproved && (
                        <td className="px-4 py-3">
                          <Button type="button" variant="danger" size="sm" onClick={() => remove(index)} aria-label="Remover item">Remover</Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isApproved && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => append({ product: '', quantity: '', unit_price: '' })}
                className="mt-2"
              >
                Adicionar Item
              </Button>
            )}
          </div>

          <div className="text-right">
            <strong className="text-lg text-neutral-900">Total: {grandTotal}</strong>
          </div>

          {!isApproved && (
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={isPending} loading={isPending}>
                {isPending ? 'Salvando...' : 'Salvar como rascunho'}
              </Button>
              {isEditing && (
                <Button type="button" variant="secondary" onClick={handleApprove} disabled={isPending} loading={isPending}>
                  {isPending ? 'Aprovando...' : 'Aprovar'}
                </Button>
              )}
            </div>
          )}

          {!isEditing && (
            <Button type="button" variant="secondary" onClick={() => navigate('/app/purchasing/orders')}>
              Cancelar
            </Button>
          )}
        </form>
      </Card>
    </div>
  )
}
