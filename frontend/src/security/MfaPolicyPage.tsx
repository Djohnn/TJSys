import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

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
      apiRequest<MFAPolicy>('/security/mfa-policy/', {
        tenantId,
        signal,
      }) as Promise<MFAPolicy>,
    enabled: !!tenantId,
  })

  const updateMutation = useMutation({
    mutationFn: (body: MFAPolicy) =>
      apiRequest<MFAPolicy>('/security/mfa-policy/', {
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

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar política MFA.</p>

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
    <div data-testid="mfa-policy-page" className="p-6">
      <Card title="Política MFA">
        {successMessage && <p data-testid="success-message" className="mb-4 p-3 rounded-lg bg-green-50 text-success text-sm">{successMessage}</p>}
        {submitError && <p data-testid="form-error" className="mb-4 p-3 rounded-lg bg-red-50 text-danger text-sm">{submitError}</p>}

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={allowTotp}
                onChange={(e) => setAllowTotp(e.target.checked)}
                disabled={!canEdit}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-neutral-300 rounded-full peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-all peer-checked:after:translate-x-4" />
            </div>
            <span className="text-sm text-neutral-700">Autenticador (TOTP)</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={allowEmail}
                onChange={(e) => setAllowEmail(e.target.checked)}
                disabled={!canEdit}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-neutral-300 rounded-full peer-checked:bg-primary-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-all peer-checked:after:translate-x-4" />
            </div>
            <span className="text-sm text-neutral-700">Código por E-mail</span>
          </label>
        </div>

        {!canEdit && <p data-testid="readonly-notice" className="mt-4 text-sm text-text-muted">Visualização somente leitura.</p>}

        {canEdit && (
          <div className="mt-6">
            <Button onClick={handleSave} loading={updateMutation.isPending}>
              {updateMutation.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
