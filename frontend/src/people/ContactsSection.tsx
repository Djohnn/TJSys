import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { contactFormSchema, type ContactFormData } from './peopleSchemas'
import { createContact, updateContact } from './peopleApi'
import type { Contact } from './peopleApi'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

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

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'
  const labelClass = 'block text-sm font-medium text-neutral-700 mb-1'
  const errorClass = 'text-sm text-red-600 mt-1'

  return (
    <form onSubmit={handleSubmit(onSubmit)} data-testid="contact-form" className="flex items-end gap-3 p-4 bg-neutral-50 rounded-lg border border-border">
      <div>
        <label htmlFor="contact-type" className={labelClass}>Tipo</label>
        <select id="contact-type" {...register('type')} className={inputClass}>
          <option value="phone">Telefone</option>
          <option value="email">Email</option>
        </select>
      </div>
      <div className="flex-1">
        <label htmlFor="contact-value" className={labelClass}>Valor</label>
        <input id="contact-value" {...register('value')} className={inputClass} />
        {errors.value && <p role="alert" className={errorClass}>{errors.value.message}</p>}
      </div>
      <div className="flex items-center pb-1">
        <label className="flex items-center gap-2 text-sm text-neutral-700 whitespace-nowrap">
          <input type="checkbox" {...register('is_primary')} className="rounded border-border" />
          Principal
        </label>
      </div>
      <div className="flex gap-2 pb-0.5">
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
      <h3 className="text-lg font-semibold text-neutral-900 mb-3">Contatos</h3>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-3">{error}</div>
      )}

      <div className="space-y-3">
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
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                <div className="flex items-center gap-3 text-sm text-neutral-700">
                  <span className="text-neutral-500">{c.type === 'phone' ? '(xx) xxxx-xxxx' : 'email@'}</span>
                  <span>{c.value}</span>
                  {c.is_primary && <Badge variant="info">Principal</Badge>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditingId(c.id)} type="button">
                  Editar
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {addingNew ? (
        <div className="mt-3">
          <ContactFormInline
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => { setAddingNew(false); setError(null) }}
            isPending={createMutation.isPending}
          />
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAddingNew(true)} type="button" className="mt-3">
          Adicionar Contato
        </Button>
      )}
    </div>
  )
}
