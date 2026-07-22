import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { contactFormSchema, type ContactFormData } from './peopleSchemas'
import { createContact, updateContact } from './peopleApi'
import type { Contact } from './peopleApi'

interface ContactsSectionProps {
  personId: string
  contacts: Contact[]
}

function ContactFormInline({
  initialData,
  onSubmit,
  onCancel,
  isPending,
}: {
  initialData?: ContactFormData
  onSubmit: (data: ContactFormData) => void
  onCancel: () => void
  isPending: boolean
}): ReactNode {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: initialData ?? {
      type: 'phone',
      value: '',
      is_primary: false,
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="contact-form">
      <div>
        <label htmlFor="contact-type">Tipo</label>
        <select id="contact-type" {...register('type')}>
          <option value="phone">Telefone</option>
          <option value="email">Email</option>
        </select>
      </div>
      <div>
        <label htmlFor="contact-value">Valor</label>
        <input id="contact-value" {...register('value')} />
        {errors.value && <span role="alert">{errors.value.message}</span>}
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

export default function ContactsSection({
  personId,
  contacts,
}: ContactsSectionProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (body: ContactFormData) => createContact(tenantId, personId, body),
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
        setError('Erro ao adicionar contato.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ContactFormData }) =>
      updateContact(tenantId, personId, id, body),
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
        setError('Erro ao atualizar contato.')
      }
    },
  })

  return (
    <div data-testid="contacts-section">
      <h3>Contatos</h3>
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {contacts.map((c) => (
        <div key={c.id} data-testid="contact-row">
          {editingId === c.id ? (
            <ContactFormInline
              initialData={{
                type: c.type,
                value: c.value,
                is_primary: c.is_primary,
              }}
              onSubmit={(data) => updateMutation.mutate({ id: c.id, body: data })}
              onCancel={() => { setEditingId(null); setError(null) }}
              isPending={updateMutation.isPending}
            />
          ) : (
            <div>
              <span>
                {c.type === 'phone' ? '📞' : '✉️'} {c.value}
                {c.is_primary ? ' (Principal)' : ''}
              </span>
              <button onClick={() => setEditingId(c.id)} type="button">
                Editar
              </button>
            </div>
          )}
        </div>
      ))}

      {addingNew ? (
        <ContactFormInline
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setAddingNew(false); setError(null) }}
          isPending={createMutation.isPending}
        />
      ) : (
        <button onClick={() => setAddingNew(true)} type="button">
          Adicionar Contato
        </button>
      )}
    </div>
  )
}
