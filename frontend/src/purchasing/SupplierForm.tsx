import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { supplierSchema, type SupplierFormData } from './purchasingSchemas'

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
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="supplier-name">Nome</label>
        <input id="supplier-name" {...register('name')} />
        {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name.message}</span>}
      </div>

      <div>
        <label htmlFor="supplier-cnpj">CNPJ</label>
        <input id="supplier-cnpj" {...register('cnpj')} />
      </div>

      <div>
        <label htmlFor="supplier-ie">Inscrição Estadual</label>
        <input id="supplier-ie" {...register('ie')} />
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
