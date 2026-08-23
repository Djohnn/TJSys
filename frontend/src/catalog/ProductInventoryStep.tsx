import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchProductStockSummary,
  fetchProductStockPolicies,
  updateProductStockPolicy,
} from '@/inventory/inventoryApi'
import { stockPolicySchema, type StockPolicyFormData } from '@/inventory/inventorySchemas'
import type { ProductStockSummary } from '@/inventory/inventoryApi'
import { formatQuantity } from '@/components/formatQuantity'

const STATUS_LABEL: Record<string, string> = {
  negative: 'Negativo',
  zero: 'Zero',
  low: 'Baixo',
  normal: 'Normal',
}

const STATUS_CLASS: Record<string, string> = {
  negative: 'bg-red-100 text-red-700',
  zero: 'bg-neutral-100 text-neutral-600',
  low: 'bg-amber-100 text-amber-700',
  normal: 'bg-green-100 text-green-700',
}

interface ProductInventoryStepProps {
  productId: string
}

export default function ProductInventoryStep({ productId }: ProductInventoryStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['product-stock-summary', tenantId, productId],
    queryFn: ({ signal }) => fetchProductStockSummary(tenantId, productId, signal),
    enabled: !!tenantId && !!productId,
  })

  // Extract the first summary from the list (when no filters, API returns ordered collection)
  const summary: ProductStockSummary | null = summaryData
    ? (Array.isArray(summaryData) ? (summaryData[0] ?? null) : summaryData)
    : null

  const { data: policiesData } = useQuery({
    queryKey: ['product-stock-policies', tenantId, productId],
    queryFn: () => fetchProductStockPolicies(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })

  const policy = policiesData?.results?.[0] ?? null

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StockPolicyFormData>({
    resolver: zodResolver(stockPolicySchema),
    values: policy
      ? {
          minimum_quantity: policy.minimum_quantity,
          maximum_quantity: policy.maximum_quantity ?? '',
          reorder_point: policy.reorder_point,
          allow_negative: policy.allow_negative,
        }
      : undefined,
  })

  const policyMutation = useMutation({
    mutationFn: (data: StockPolicyFormData) =>
      updateProductStockPolicy(tenantId, policy!.id, data, policy!.version),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['product-stock-summary', tenantId, productId] })
      await queryClient.invalidateQueries({ queryKey: ['product-stock-policies', tenantId, productId] })
    },
  })

  const status = summary?.status ?? 'zero'

  return (
    <div data-testid="product-inventory-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Estoque</h2>

      {isLoading ? (
        <div data-testid="inventory-loading" className="text-sm text-neutral-500">Carregando resumo de estoque...</div>
      ) : !summary ? (
        <div className="p-4 border border-border rounded-lg bg-neutral-50 text-sm text-neutral-500">
          Este produto não possui controle de estoque configurado.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div>
              <p className="text-sm text-neutral-500">Disponível em estoque</p>
              <p className="text-3xl font-black text-neutral-900 mt-1" data-testid="stock-available-value">
                {formatQuantity(summary.available, { precision: summary.unit_precision, symbol: summary.unit_symbol })}
              </p>
            </div>
            <div
              role="status"
              data-status={status}
              className={`ml-auto rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${STATUS_CLASS[status] ?? STATUS_CLASS.zero}`}
            >
              {STATUS_LABEL[status] ?? 'Zero'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Quantidade atual</p>
              <p className="mt-1 text-xl font-bold text-neutral-900" data-testid="stock-current-value">{formatQuantity(summary.quantity, { precision: summary.unit_precision, symbol: summary.unit_symbol })}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Reservada</p>
              <p className="mt-1 text-xl font-bold text-neutral-900" data-testid="stock-reserved-value">{formatQuantity(summary.reserved, { precision: summary.unit_precision, symbol: summary.unit_symbol })}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Mínima</p>
              <p className="mt-1 text-xl font-bold text-neutral-900" data-testid="stock-minimum-value">{formatQuantity(summary.minimum_quantity, { precision: summary.unit_precision, symbol: summary.unit_symbol })}</p>
            </div>
            <div className="rounded-xl border border-border bg-white p-4">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Ponto de reposição</p>
              <p className="mt-1 text-xl font-bold text-neutral-900" data-testid="stock-reorder-value">{formatQuantity(summary.reorder_point, { precision: summary.unit_precision, symbol: summary.unit_symbol })}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {summary.branch && summary.location ? (
              <Link
                to={`/inventory/adjustments/new?product=${productId}&branch=${summary.branch}&location=${summary.location}`}
                className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer inline-flex items-center"
                data-testid="inventory-adjust-link"
              >
                Ajustar estoque
              </Link>
            ) : (
              <span className="px-4 py-2 text-sm text-neutral-400 border border-border rounded-lg" data-testid="inventory-adjust-link-disabled">
                Ajustar estoque
              </span>
            )}
            <Link
              to={`/inventory/movements?product=${productId}&branch=${summary.branch ?? ''}&location=${summary.location ?? ''}`}
              className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer inline-flex items-center"
              data-testid="inventory-movements-link"
            >
              Ver movimentações
            </Link>
          </div>

          {policy && (
            <form
              onSubmit={handleSubmit((data) => policyMutation.mutate(data))}
              data-testid="stock-policy-form"
              className="space-y-4 rounded-2xl border border-border bg-white p-4"
            >
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-neutral-500">Política de estoque</h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label htmlFor="policy-min" className="block text-sm font-medium text-neutral-700 mb-1">Mínima</label>
                  <input
                    id="policy-min"
                    type="number"
                    step="0.000001"
                    {...register('minimum_quantity')}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="policy-minimum-input"
                  />
                  {errors.minimum_quantity && <p role="alert" className="text-xs text-red-600 mt-1">{errors.minimum_quantity.message}</p>}
                </div>
                <div>
                  <label htmlFor="policy-max" className="block text-sm font-medium text-neutral-700 mb-1">Máxima</label>
                  <input
                    id="policy-max"
                    type="number"
                    step="0.000001"
                    {...register('maximum_quantity')}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="policy-maximum-input"
                  />
                  {errors.maximum_quantity && <p role="alert" className="text-xs text-red-600 mt-1">{errors.maximum_quantity.message}</p>}
                </div>
                <div>
                  <label htmlFor="policy-reorder" className="block text-sm font-medium text-neutral-700 mb-1">Ponto de reposição</label>
                  <input
                    id="policy-reorder"
                    type="number"
                    step="0.000001"
                    {...register('reorder_point')}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    data-testid="policy-reorder-input"
                  />
                  {errors.reorder_point && <p role="alert" className="text-xs text-red-600 mt-1">{errors.reorder_point.message}</p>}
                </div>
                <label className="flex items-end gap-2 text-sm text-neutral-700 pb-2">
                  <input
                    type="checkbox"
                    {...register('allow_negative')}
                    className="rounded border-border"
                    data-testid="policy-allow-negative-input"
                  />
                  Permitir negativo
                </label>
              </div>
              <button
                type="submit"
                disabled={policyMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 cursor-pointer disabled:opacity-50"
                data-testid="policy-save-button"
              >
                {policyMutation.isPending ? 'Salvando...' : 'Salvar política'}
              </button>
            </form>
          )}
        </>
      )}

      <p className="text-sm text-neutral-500">
        O saldo de estoque é gerenciado pelo módulo de Inventário; movimentos criam entradas auditáveis.
      </p>
    </div>
  )
}
