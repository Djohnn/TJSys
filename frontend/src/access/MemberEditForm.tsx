import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { memberUpdateSchema } from './accessSchemas'
import type { MemberUpdateFormData } from './accessSchemas'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Gerente',
  operator: 'Operador',
}

interface Member {
  id: number
  email?: string
  user?: {
    id: number
    email: string
    name: string
  }
  role: string
  is_active: boolean
  branch_ids?: string[]
}

interface MemberEditFormProps {
  member: Member
  onSubmit: (data: MemberUpdateFormData) => void
  onCancel: () => void
  isPending: boolean
  submitError: string | null
  setSubmitError: (err: string | null) => void
}

export default function MemberEditForm({
  member,
  onSubmit,
  onCancel,
  isPending,
  submitError,
  setSubmitError,
}: MemberEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MemberUpdateFormData>({
    resolver: zodResolver(memberUpdateSchema),
    defaultValues: {
      role: member.role as 'admin' | 'manager' | 'operator',
      is_active: member.is_active,
      branch_ids: member.branch_ids ?? [],
    },
  })

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setSubmitError(null)
        onSubmit(data)
      })}
      data-testid="member-edit-form"
    >
      {submitError && (
        <div data-testid="form-error" role="alert" style={{ color: 'red' }}>
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor="member-role">Função</label>
        <select id="member-role" {...register('role')}>
          {(['admin', 'manager', 'operator'] as const).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {errors.role && <span role="alert" style={{ color: 'red' }}>{errors.role.message}</span>}
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
