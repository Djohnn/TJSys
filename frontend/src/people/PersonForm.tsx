import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { personFormSchema, type PersonFormData } from './peopleSchemas'
import Button from '@/components/ui/Button'

interface PersonFormProps {
  initialData?: Partial<PersonFormData>
  onSubmit: (data: PersonFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function PersonForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: PersonFormProps): ReactNode {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PersonFormData>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      person_type: 'PF',
      role: 'customer',
      is_active: true,
      name: '',
      cpf: '',
      rg: '',
      company_name: '',
      trade_name: '',
      cnpj: '',
      ie: '',
      ...initialData,
    },
  })

  const personType = watch('person_type')

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'
  const labelClass = 'block text-sm font-medium text-neutral-700 mb-1'
  const errorClass = 'text-sm text-red-600 mt-1'

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        const cleaned = { ...data }
        if (cleaned.person_type === 'PF') {
          cleaned.cpf = cleaned.cpf.replace(/\D/g, '')
          cleaned.rg = (cleaned.rg ?? '').replace(/\D/g, '')
        } else {
          cleaned.cnpj = (cleaned.cnpj ?? '').replace(/\D/g, '')
          cleaned.ie = (cleaned.ie ?? '').replace(/\D/g, '')
        }
        onSubmit(cleaned)
      })}
      data-testid="person-form"
      className="space-y-4"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="person-type" className={labelClass}>Tipo</label>
          <select id="person-type" {...register('person_type')} className={inputClass}>
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Pessoa Jurídica</option>
          </select>
        </div>

        <div>
          <label htmlFor="person-role" className={labelClass}>Função</label>
          <select id="person-role" {...register('role')} className={inputClass}>
            <option value="customer">Cliente</option>
            <option value="supplier">Fornecedor</option>
            <option value="employee">Funcionário</option>
          </select>
        </div>
      </div>

      {personType === 'PF' ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="person-name" className={labelClass}>Nome</label>
            <input id="person-name" {...register('name')} className={inputClass} />
            {errors.name && <p role="alert" className={errorClass}>{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="person-cpf" className={labelClass}>CPF</label>
            <input id="person-cpf" {...register('cpf')} className={inputClass} />
            {errors.cpf && <p role="alert" className={errorClass}>{errors.cpf.message}</p>}
          </div>

          <div>
            <label htmlFor="person-rg" className={labelClass}>RG</label>
            <input id="person-rg" {...register('rg')} className={inputClass} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="person-company-name" className={labelClass}>Razão Social</label>
            <input id="person-company-name" {...register('company_name')} className={inputClass} />
            {errors.company_name && <p role="alert" className={errorClass}>{errors.company_name.message}</p>}
          </div>

          <div>
            <label htmlFor="person-trade-name" className={labelClass}>Nome Fantasia</label>
            <input id="person-trade-name" {...register('trade_name')} className={inputClass} />
            {errors.trade_name && <p role="alert" className={errorClass}>{errors.trade_name.message}</p>}
          </div>

          <div>
            <label htmlFor="person-cnpj" className={labelClass}>CNPJ</label>
            <input id="person-cnpj" {...register('cnpj')} className={inputClass} />
            {errors.cnpj && <p role="alert" className={errorClass}>{errors.cnpj.message}</p>}
          </div>

          <div>
            <label htmlFor="person-ie" className={labelClass}>Inscrição Estadual</label>
            <input id="person-ie" {...register('ie')} className={inputClass} />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isPending} loading={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variant="secondary" type="button" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
