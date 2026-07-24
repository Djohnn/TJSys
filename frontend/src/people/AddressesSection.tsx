import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { addressFormSchema, type AddressFormData } from './peopleSchemas'
import { createAddress, updateAddress } from './peopleApi'
import type { Address } from './peopleApi'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface AddressesSectionProps {
  personId: string
  addresses: Address[]
}

function AddressFormInline({
  initialData,
  onSubmit,
  onCancel,
  isPending,
}: {
  initialData?: AddressFormData
  onSubmit: (data: AddressFormData) => void
  onCancel: () => void
  isPending: boolean
}): ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddressFormData>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: initialData ?? {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zip: '',
      is_primary: false,
    },
  })

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'
  const labelClass = 'block text-sm font-medium text-neutral-700 mb-1'
  const errorClass = 'text-sm text-red-600 mt-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="address-form" className="grid grid-cols-2 gap-3 p-4 bg-neutral-50 rounded-lg border border-border">
      <div>
        <label htmlFor="addr-street" className={labelClass}>Logradouro</label>
        <input id="addr-street" {...register('street')} className={inputClass} />
        {errors.street && <p role="alert" className={errorClass}>{errors.street.message}</p>}
      </div>
      <div>
        <label htmlFor="addr-number" className={labelClass}>Número</label>
        <input id="addr-number" {...register('number')} className={inputClass} />
        {errors.number && <p role="alert" className={errorClass}>{errors.number.message}</p>}
      </div>
      <div>
        <label htmlFor="addr-complement" className={labelClass}>Complemento</label>
        <input id="addr-complement" {...register('complement')} className={inputClass} />
      </div>
      <div>
        <label htmlFor="addr-neighborhood" className={labelClass}>Bairro</label>
        <input id="addr-neighborhood" {...register('neighborhood')} className={inputClass} />
        {errors.neighborhood && <p role="alert" className={errorClass}>{errors.neighborhood.message}</p>}
      </div>
      <div>
        <label htmlFor="addr-city" className={labelClass}>Cidade</label>
        <input id="addr-city" {...register('city')} className={inputClass} />
        {errors.city && <p role="alert" className={errorClass}>{errors.city.message}</p>}
      </div>
      <div>
        <label htmlFor="addr-state" className={labelClass}>Estado</label>
        <input id="addr-state" {...register('state')} className={inputClass} />
        {errors.state && <p role="alert" className={errorClass}>{errors.state.message}</p>}
      </div>
      <div>
        <label htmlFor="addr-zip" className={labelClass}>CEP</label>
        <input id="addr-zip" {...register('zip')} className={inputClass} />
        {errors.zip && <p role="alert" className={errorClass}>{errors.zip.message}</p>}
      </div>
      <div className="flex items-end pb-1">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" {...register('is_primary')} className="rounded border-border" />
          Principal
        </label>
      </div>
      <div className="col-span-2 flex gap-3">
        <Button type="submit" size="sm" disabled={isPending} loading={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={onCancel} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export default function AddressesSection({
  personId,
  addresses,
}: AddressesSectionProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (body: AddressFormData) => createAddress(tenantId, personId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', tenantId, personId] })
      setAddingNew(false)
      setError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao adicionar endereço.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AddressFormData }) =>
      updateAddress(tenantId, personId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', tenantId, personId] })
      setEditingId(null)
      setError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao atualizar endereço.')
      }
    },
  })

  return (
    <div data-testid="addresses-section">
      <h3 className="text-lg font-semibold text-neutral-900 mb-3">Endereços</h3>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-3">{error}</div>
      )}

      <div className="space-y-3">
        {addresses.map((addr) => (
          <div key={addr.id} data-testid="address-row">
            {editingId === addr.id ? (
              <AddressFormInline
                initialData={{
                  street: addr.street,
                  number: addr.number,
                  complement: addr.complement,
                  neighborhood: addr.neighborhood,
                  city: addr.city,
                  state: addr.state,
                  zip: addr.zip,
                  is_primary: addr.is_primary,
                }}
                onSubmit={(data) => updateMutation.mutate({ id: addr.id, body: data })}
                onCancel={() => { setEditingId(null); setError(null) }}
                isPending={updateMutation.isPending}
              />
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                <div className="text-sm text-neutral-700">
                  <span>
                    {addr.street}, {addr.number}
                    {addr.complement ? ` - ${addr.complement}` : ''}
                  </span>
                  <span className="text-neutral-500"> - {addr.neighborhood}, {addr.city}/{addr.state} - {addr.zip}</span>
                  {addr.is_primary && <Badge variant="info" className="ml-2">Principal</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(addr.id)} type="button">
                  Editar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {addingNew ? (
        <div className="mt-3">
          <AddressFormInline
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => { setAddingNew(false); setError(null) }}
            isPending={createMutation.isPending}
          />
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAddingNew(true)} type="button" className="mt-3">
          Adicionar Endereço
        </Button>
      )}
    </div>
  )
}
