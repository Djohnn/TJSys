import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchProductFiscalData, upsertProductFiscalData } from './catalogApi'
import { fiscalDataSchema, type FiscalDataFormData } from './catalogSchemas'
import Button from '@/components/ui/Button'

const FISCAL_TYPE_OPTIONS = [
  { value: '', label: 'Selecione...' },
  { value: '00', label: '00 - Tributado integralmente' },
  { value: '10', label: '10 - Tributado com ICMS ST' },
  { value: '20', label: '20 - Com redução de base de cálculo' },
  { value: '30', label: '30 - Isento / Não tributado' },
  { value: '40', label: '40 - Imune' },
  { value: '60', label: '60 - ICMS cobrado anteriormente por ST' },
  { value: '70', label: '70 - Com redução de BC e cobrança ST' },
]

const ORIGIN_CODE_OPTIONS = [
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira (importação direta)' },
  { value: '2', label: '2 - Estrangeira (mercado interno)' },
  { value: '3', label: '3 - Nacional (conteúdo de importação > 40%)' },
  { value: '4', label: '4 - Nacional (conformidade com processos)' },
  { value: '5', label: '5 - Nacional (conteúdo de importação ≤ 40%)' },
  { value: '6', label: '6 - Estrangeira (importação direta, sem similar)' },
  { value: '7', label: '7 - Estrangeira (mercado interno, sem similar)' },
  { value: '8', label: '8 - Nacional (conteúdo de importação > 70%)' },
]

interface ProductFiscalStepProps {
  productId: string
}

export default function ProductFiscalStep({ productId }: ProductFiscalStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const [fiscalWarning, setFiscalWarning] = useState<string | null>(null)

  const { data: fiscalData, isLoading: fiscalLoading } = useQuery({
    queryKey: ['product-fiscal-data', tenantId, productId],
    queryFn: () => fetchProductFiscalData(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })

  const {
    register: registerFiscal,
    handleSubmit: handleFiscalSubmit,
    formState: { errors: fiscalErrors },
  } = useForm<FiscalDataFormData>({
    resolver: zodResolver(fiscalDataSchema),
    values: fiscalData
      ? {
          fiscal_type: fiscalData.fiscal_type ?? '',
          ncm: fiscalData.ncm ?? '',
          cest: fiscalData.cest ?? '',
          origin_code: fiscalData.origin_code ?? '0',
          fiscal_class: fiscalData.fiscal_class ?? '',
        }
      : undefined,
  })

  const fiscalMutation = useMutation({
    mutationFn: (data: FiscalDataFormData) =>
      upsertProductFiscalData(tenantId, productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-fiscal-data', tenantId, productId] })
      setFiscalWarning(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setFiscalWarning(err.problem.detail ?? 'Erro ao salvar dados fiscais.')
      } else {
        setFiscalWarning('Erro ao salvar dados fiscais.')
      }
    },
  })

  const handleSaveFiscal = useCallback(() => {
    handleFiscalSubmit((data) => fiscalMutation.mutate(data))()
  }, [handleFiscalSubmit, fiscalMutation])

  return (
    <div data-testid="product-fiscal-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Dados Fiscais</h2>

      {fiscalWarning && (
        <div role="alert" className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700" data-testid="fiscal-warning">
          {fiscalWarning}
        </div>
      )}

      {fiscalLoading ? (
        <p className="text-sm text-neutral-500">Carregando dados fiscais...</p>
      ) : (
        <div className="space-y-3" data-testid="fiscal-data-section">
          <div>
            <label htmlFor="fiscal-type" className="block text-sm font-medium text-neutral-700 mb-1">Tipo Fiscal</label>
            <select id="fiscal-type" {...registerFiscal('fiscal_type')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-type-select">
              {FISCAL_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="fiscal-ncm" className="block text-sm font-medium text-neutral-700 mb-1">NCM</label>
            <input id="fiscal-ncm" {...registerFiscal('ncm')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-ncm-input" />
          </div>

          <div>
            <label htmlFor="fiscal-cest" className="block text-sm font-medium text-neutral-700 mb-1">CEST</label>
            <input id="fiscal-cest" {...registerFiscal('cest')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-cest-input" />
          </div>

          <div>
            <label htmlFor="fiscal-origin-code" className="block text-sm font-medium text-neutral-700 mb-1">Código de Origem</label>
            <select id="fiscal-origin-code" {...registerFiscal('origin_code')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-origin-code-select">
              {ORIGIN_CODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fiscalErrors.origin_code && <span role="alert" className="text-xs text-red-600 mt-1 block">{fiscalErrors.origin_code.message}</span>}
          </div>

          <div>
            <label htmlFor="fiscal-class" className="block text-sm font-medium text-neutral-700 mb-1">Classe Fiscal</label>
            <input id="fiscal-class" {...registerFiscal('fiscal_class')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" data-testid="fiscal-class-input" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSaveFiscal}
            disabled={fiscalMutation.isPending}
            loading={fiscalMutation.isPending}
            data-testid="fiscal-save-button"
          >
            {fiscalMutation.isPending ? 'Salvando...' : 'Salvar Dados Fiscais'}
          </Button>
        </div>
      )}
    </div>
  )
}
