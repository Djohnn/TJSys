import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'

import { personFormSchema, type PersonFormData } from './peopleSchemas'

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
    >
      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="person-type">Tipo</label>
        <select id="person-type" {...register('person_type')}>
          <option value="PF">Pessoa Física</option>
          <option value="PJ">Pessoa Jurídica</option>
        </select>
      </div>

      <div>
        <label htmlFor="person-role">Função</label>
        <select id="person-role" {...register('role')}>
          <option value="customer">Cliente</option>
          <option value="supplier">Fornecedor</option>
          <option value="employee">Funcionário</option>
        </select>
      </div>

      {personType === 'PF' ? (
        <>
          <div>
            <label htmlFor="person-name">Nome</label>
            <input id="person-name" {...register('name')} />
            {errors.name && <span role="alert" style={{ color: 'red' }}>{errors.name.message}</span>}
          </div>

          <div>
            <label htmlFor="person-cpf">CPF</label>
            <input id="person-cpf" {...register('cpf')} />
            {errors.cpf && <span role="alert" style={{ color: 'red' }}>{errors.cpf.message}</span>}
          </div>

          <div>
            <label htmlFor="person-rg">RG</label>
            <input id="person-rg" {...register('rg')} />
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="person-company-name">Razão Social</label>
            <input id="person-company-name" {...register('company_name')} />
            {errors.company_name && <span role="alert" style={{ color: 'red' }}>{errors.company_name.message}</span>}
          </div>

          <div>
            <label htmlFor="person-trade-name">Nome Fantasia</label>
            <input id="person-trade-name" {...register('trade_name')} />
            {errors.trade_name && <span role="alert" style={{ color: 'red' }}>{errors.trade_name.message}</span>}
          </div>

          <div>
            <label htmlFor="person-cnpj">CNPJ</label>
            <input id="person-cnpj" {...register('cnpj')} />
            {errors.cnpj && <span role="alert" style={{ color: 'red' }}>{errors.cnpj.message}</span>}
          </div>

          <div>
            <label htmlFor="person-ie">Inscrição Estadual</label>
            <input id="person-ie" {...register('ie')} />
          </div>
        </>
      )}

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
