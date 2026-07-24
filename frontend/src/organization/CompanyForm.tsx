import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { companySchema, type CompanyFormData } from './organizationSchemas'
import Button from '@/components/ui/Button'

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
      className="space-y-4"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" className="p-3 rounded-lg bg-red-50 text-danger text-sm">
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="company-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
        <input id="company-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
        {errors.name && <span role="alert" className="text-danger text-xs mt-1">{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="company-cnpj" className="block text-sm font-medium text-neutral-700 mb-1">CNPJ</label>
        <input id="company-cnpj" {...register('cnpj')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
      </div>

      <div>
        <label htmlFor="company-ie" className="block text-sm font-medium text-neutral-700 mb-1">Inscrição Estadual</label>
        <input id="company-ie" {...register('ie')} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
      </div>

      <div className="flex items-center gap-2">
        <input id="company-active" type="checkbox" {...register('is_active')} className="w-4 h-4 rounded border-border text-primary-600 focus:ring-primary-500" />
        <label htmlFor="company-active" className="text-sm text-neutral-700">Ativo</label>
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
