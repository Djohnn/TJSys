import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Company } from './organizationApi'
import { branchSchema, type BranchFormData } from './organizationSchemas'
import Button from '@/components/ui/Button'

interface BranchFormProps {
  initialData?: BranchFormData
  onSubmit: (data: BranchFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function BranchForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: BranchFormProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data: companiesData } = useQuery({
    queryKey: ['companies', tenantId, 1],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Company>>('/companies/?page=1', {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Company>>,
    enabled: !!tenantId,
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: initialData ?? { company: '', name: '', ie: '', is_active: true },
  })

  const companies = companiesData?.results ?? []

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="branch-form"
      className="space-y-4"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" className="p-3 rounded-lg bg-red-50 text-danger text-sm">
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="branch-company" className="block text-sm font-medium text-neutral-700 mb-1">Empresa</label>
        <select id="branch-company" {...register('company')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
          <option value="">Selecione...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.company && <span role="alert" className="text-danger text-xs mt-1">{errors.company.message}</span>}
      </div>

      <div>
        <label htmlFor="branch-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
        <input id="branch-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        {errors.name && <span role="alert" className="text-danger text-xs mt-1">{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="branch-ie" className="block text-sm font-medium text-neutral-700 mb-1">Inscrição Estadual</label>
        <input id="branch-ie" {...register('ie')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
      </div>

      <div className="flex items-center gap-2">
        <input id="branch-active" type="checkbox" {...register('is_active')} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
        <label htmlFor="branch-active" className="text-sm text-neutral-700">Ativo</label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
