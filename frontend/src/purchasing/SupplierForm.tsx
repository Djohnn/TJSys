import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { supplierSchema, type SupplierFormData } from './purchasingSchemas'
import Button from '@/components/ui/Button'

interface SupplierFormProps {
  initialData?: SupplierFormData
  onSubmit: (data: SupplierFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function SupplierForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: SupplierFormProps): ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: initialData ?? { name: '', cnpj: '', ie: '', is_active: true },
  })

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="supplier-form"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="supplier-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
          <input id="supplier-name" {...register('name')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
          {errors.name && <span role="alert" className="text-xs text-red-600 mt-1 block">{errors.name.message}</span>}
        </div>

        <div>
          <label htmlFor="supplier-cnpj" className="block text-sm font-medium text-neutral-700 mb-1">CNPJ</label>
          <input id="supplier-cnpj" {...register('cnpj')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label htmlFor="supplier-ie" className="block text-sm font-medium text-neutral-700 mb-1">Inscrição Estadual</label>
          <input id="supplier-ie" {...register('ie')} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" {...register('is_active')} className="rounded border-border" />
            Ativo
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} loading={isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}
