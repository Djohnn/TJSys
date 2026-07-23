import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Company } from './organizationApi'
import { branchSchema, type BranchFormData } from './organizationSchemas'

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
    >
      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="branch-company">Empresa</label>
        <select id="branch-company" {...register('company')}>
          <option value="">Selecione...</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.company && <span role="alert" style={{ color: 'red' }}>{errors.company.message}</span>}
      </div>

      <div>
        <label htmlFor="branch-name">Nome</label>
        <input id="branch-name" {...register('name')} />
        {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="branch-ie">Inscrição Estadual</label>
        <input id="branch-ie" {...register('ie')} />
      </div>

      <div>
        <label>
          <input type="checkbox" {...register('is_active')} />
          Ativo
        </label>
      </div>

      <div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
