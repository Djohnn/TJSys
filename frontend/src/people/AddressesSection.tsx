import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { addressFormSchema, type AddressFormData } from './peopleSchemas'
import { createAddress, updateAddress } from './peopleApi'
import type { Address } from './peopleApi'

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="address-form">
      <div>
        <label htmlFor="addr-street">Logradouro</label>
        <input id="addr-street" {...register('street')} />
        {errors.street && <span role="alert">{errors.street.message}</span>}
      </div>
      <div>
        <label htmlFor="addr-number">Número</label>
        <input id="addr-number" {...register('number')} />
        {errors.number && <span role="alert">{errors.number.message}</span>}
      </div>
      <div>
        <label htmlFor="addr-complement">Complemento</label>
        <input id="addr-complement" {...register('complement')} />
      </div>
      <div>
        <label htmlFor="addr-neighborhood">Bairro</label>
        <input id="addr-neighborhood" {...register('neighborhood')} />
        {errors.neighborhood && <span role="alert">{errors.neighborhood.message}</span>}
      </div>
      <div>
        <label htmlFor="addr-city">Cidade</label>
        <input id="addr-city" {...register('city')} />
        {errors.city && <span role="alert">{errors.city.message}</span>}
      </div>
      <div>
        <label htmlFor="addr-state">Estado</label>
        <input id="addr-state" {...register('state')} />
        {errors.state && <span role="alert">{errors.state.message}</span>}
      </div>
      <div>
        <label htmlFor="addr-zip">CEP</label>
        <input id="addr-zip" {...register('zip')} />
        {errors.zip && <span role="alert">{errors.zip.message}</span>}
      </div>
      <div>
        <label>
          <input type="checkbox" {...register('is_primary')} />
          Principal
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
      <h3>Endereços</h3>
      {error && <div style={{ color: 'red' }}>{error}</div>}

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
            <div>
              <span>
                {addr.street}, {addr.number}
                {addr.complement ? ` - ${addr.complement}` : ''}
                {addr.is_primary ? ' (Principal)' : ''}
              </span>
              <span> - {addr.neighborhood}, {addr.city}/{addr.state} - {addr.zip}</span>
              <button onClick={() => setEditingId(addr.id)} type="button">
                Editar
              </button>
            </div>
          )}
        </div>
      ))}

      {addingNew ? (
        <AddressFormInline
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setAddingNew(false); setError(null) }}
          isPending={createMutation.isPending}
        />
      ) : (
        <button onClick={() => setAddingNew(true)} type="button">
          Adicionar Endereço
        </button>
      )}
    </div>
  )
}
