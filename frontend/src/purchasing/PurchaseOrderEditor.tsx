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

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

const STATUS_BADGE_COLOR: Record<string, string> = {
  draft: 'blue',
  approved: 'green',
  received: 'gray',
  cancelled: 'red',
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
      setTimeout(() => navigate(`/purchasing/orders/${data.id}`), 500)
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
      setTimeout(() => navigate(`/purchasing/orders/${data.id}`), 500)
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
    <div data-testid="purchase-order-editor">
      <h2>{isEditing ? `Ordem de Compra: ${existingOrder?.number ?? ''}` : 'Nova Ordem de Compra'}</h2>

      {isEditing && existingOrder && (
        <div>
          <span
            data-testid="status-badge"
            className={`badge-${STATUS_BADGE_COLOR[existingOrder.status] ?? 'gray'}`}
          >
            {STATUS_LABEL[existingOrder.status] ?? existingOrder.status}
          </span>
        </div>
      )}

      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      {successMessage && (
        <div data-testid="success-message" role="status" style={{ color: 'green' }}>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label htmlFor="order-supplier">Fornecedor</label>
          <select id="order-supplier" {...register('supplier')} disabled={isApproved}>
            <option value="">Selecione...</option>
            {suppliers.map((s: Supplier) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.supplier && <span role="alert" style={{ color: 'red' }}>{errors.supplier.message}</span>}
        </div>

        <div>
          <label htmlFor="order-branch">Filial</label>
          <select id="order-branch" {...register('branch')} disabled={isApproved}>
            <option value="">Selecione...</option>
            {branches.map((b: Branch) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {errors.branch && <span role="alert" style={{ color: 'red' }}>{errors.branch.message}</span>}
        </div>

        <div>
          <h3>Itens</h3>
          {errors.items && (
            <p role="alert" style={{ color: 'red' }}>{errors.items.message || errors.items.root?.message}</p>
          )}

          <table data-testid="items-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Preço Unitário</th>
                <th>Total</th>
                {!isApproved && <th>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} data-testid="item-row">
                  <td>
                    <input
                      {...register(`items.${index}.product`)}
                      aria-label="Produto"
                      disabled={isApproved}
                    />
                    {errors.items?.[index]?.product && (
                      <span role="alert" style={{ color: 'red' }}>{errors.items[index]?.product?.message}</span>
                    )}
                  </td>
                  <td>
                    <input
                      {...register(`items.${index}.quantity`)}
                      aria-label="Quantidade"
                      disabled={isApproved}
                    />
                    {errors.items?.[index]?.quantity && (
                      <span role="alert" style={{ color: 'red' }}>{errors.items[index]?.quantity?.message}</span>
                    )}
                  </td>
                  <td>
                    <input
                      {...register(`items.${index}.unit_price`)}
                      aria-label="Preço unitário"
                      disabled={isApproved}
                    />
                    {errors.items?.[index]?.unit_price && (
                      <span role="alert" style={{ color: 'red' }}>{errors.items[index]?.unit_price?.message}</span>
                    )}
                  </td>
                  <td>
                    {watchedItems?.[index]
                      ? computeLineTotal(watchedItems[index].quantity, watchedItems[index].unit_price)
                      : '0.00'}
                  </td>
                  {!isApproved && (
                    <td>
                      <button type="button" onClick={() => remove(index)} aria-label="Remover item">
                        Remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {!isApproved && (
            <button
              type="button"
              onClick={() => append({ product: '', quantity: '', unit_price: '' })}
            >
              Adicionar Item
            </button>
          )}
        </div>

        <div>
          <strong>Total: {grandTotal}</strong>
        </div>

        {!isApproved && (
          <div>
            <button type="submit" disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar como rascunho'}
            </button>
            {isEditing && (
              <button type="button" onClick={handleApprove} disabled={isPending}>
                {isPending ? 'Aprovando...' : 'Aprovar'}
              </button>
            )}
          </div>
        )}

        {!isEditing && (
          <button type="button" onClick={() => navigate('/purchasing/orders')}>
            Cancelar
          </button>
        )}
      </form>
    </div>
  )
}
