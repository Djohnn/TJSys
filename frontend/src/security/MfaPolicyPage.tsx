import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'

interface MFAPolicy {
  allow_totp: boolean
  allow_email: boolean
}

export default function MfaPolicyPage() {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const role = selectedTenant?.role ?? ''
  const canEdit = role === 'admin'

  const [allowTotp, setAllowTotp] = useState(true)
  const [allowEmail, setAllowEmail] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mfa-policy', tenantId],
    queryFn: ({ signal }) =>
      apiRequest<MFAPolicy>(`/memberships/mfa-policy/`, {
        tenantId,
        signal,
      }) as Promise<MFAPolicy>,
    enabled: !!tenantId,
  })

  const updateMutation = useMutation({
    mutationFn: (body: MFAPolicy) =>
      apiRequest<MFAPolicy>(`/memberships/mfa-policy/`, {
        method: 'PATCH',
        tenantId,
        body,
      }) as Promise<MFAPolicy>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mfa-policy', tenantId] })
      setSubmitError(null)
      setSuccessMessage('Política MFA atualizada com sucesso.')
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        const messages = Object.values(err.problem.errors).flat().join(', ')
        setSubmitError(messages || err.problem.detail)
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar política MFA.')
      }
    },
  })

  useEffect(() => {
    if (data) {
      setAllowTotp(data.allow_totp)
      setAllowEmail(data.allow_email)
    }
  }, [data])

  if (isLoading) return <LoadingState message="Carregando política MFA..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar política MFA.</p>

  const handleSave = () => {
    setSuccessMessage(null)
    setSubmitError(null)

    if (!allowTotp && !allowEmail) {
      setSubmitError('Pelo menos um método MFA deve estar ativo.')
      return
    }

    updateMutation.mutate({ allow_totp: allowTotp, allow_email: allowEmail })
  }

  return (
    <div data-testid="mfa-policy-page">
      <h2>Política MFA</h2>

      {successMessage && <p data-testid="success-message">{successMessage}</p>}
      {submitError && <p data-testid="form-error">{submitError}</p>}

      <div>
        <label>
          <input
            type="checkbox"
            checked={allowTotp}
            onChange={(e) => setAllowTotp(e.target.checked)}
            disabled={!canEdit}
          />
          {' '}Autenticador (TOTP)
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={allowEmail}
            onChange={(e) => setAllowEmail(e.target.checked)}
            disabled={!canEdit}
          />
          {' '}Código por E-mail
        </label>
      </div>

      {!canEdit && <p data-testid="readonly-notice">Visualização somente leitura.</p>}

      {canEdit && (
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          type="button"
        >
          {updateMutation.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      )}
    </div>
  )
}
