import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { inviteSchema } from './accessSchemas'
import type { InviteFormData } from './accessSchemas'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  operator: 'Operador',
}

interface InvitationFormProps {
  onSubmit: (data: InviteFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function InvitationForm({
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: InvitationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'operator', branch_ids: [] },
  })

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="invitation-form"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="invite-email">Email</label>
        <input id="invite-email" type="email" {...register('email')} />
        {errors.email && <span role="alert" style={{ color: 'red' }}>{errors.email.message}</span>}
      </div>

      <div>
        <label htmlFor="invite-role">Função</label>
        <select id="invite-role" {...register('role')}>
          {(['admin', 'manager', 'operator'] as const).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {errors.role && <span role="alert" style={{ color: 'red' }}>{errors.role.message}</span>}
      </div>

      <div>
        <button type="submit" disabled={isPending}>
          {isPending ? 'Enviando...' : 'Convidar'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
