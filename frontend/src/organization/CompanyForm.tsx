import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { companySchema, type CompanyFormData } from './organizationSchemas'

interface CompanyFormProps {
  initialData?: CompanyFormData
  onSubmit: (data: CompanyFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function CompanyForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: CompanyFormProps): ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: initialData ?? { name: '', cnpj: '', ie: '', is_active: true },
  })

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="company-form"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="company-name">Nome</label>
        <input id="company-name" {...register('name')} />
        {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="company-cnpj">CNPJ</label>
        <input id="company-cnpj" {...register('cnpj')} />
      </div>

      <div>
        <label htmlFor="company-ie">Inscrição Estadual</label>
        <input id="company-ie" {...register('ie')} />
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
