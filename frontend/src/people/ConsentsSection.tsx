import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { grantConsent, revokeConsent } from './peopleApi'
import type { Consent } from './peopleApi'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface ConsentsSectionProps {
  personId: string
  consents: Consent[]
}

const CONSENT_TYPE_LABELS: Record<string, string> = {
  privacy_policy: 'Política de Privacidade',
  terms_of_service: 'Termos de Serviço',
  marketing: 'Marketing',
  data_processing: 'Processamento de Dados',
}

export default function ConsentsSection({
  personId,
  consents,
}: ConsentsSectionProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [grantingType, setGrantingType] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const grantMutation = useMutation({
    mutationFn: (type: string) => grantConsent(tenantId, personId, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', tenantId, personId] })
      setGrantingType(null)
      setError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao conceder consentimento.')
      }
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (consentId: string) => revokeConsent(tenantId, personId, consentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', tenantId, personId] })
      setConfirmRevoke(null)
      setError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao revogar consentimento.')
      }
    },
  })

  const existingTypes = new Set(consents.filter((c) => !c.revoked_at).map((c) => c.type))
  const availableTypes = Object.keys(CONSENT_TYPE_LABELS).filter((t) => !existingTypes.has(t))

  const inputClass = 'block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm'

  return (
    <div data-testid="consents-section">
      <h3 className="text-lg font-semibold text-neutral-900 mb-3">Consentimentos</h3>
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-3">{error}</div>
      )}

      {consents.length === 0 && (
        <p className="text-sm text-neutral-500 mb-3">Nenhum consentimento registrado.</p>
      )}

      <div className="space-y-3">
        {consents.map((c) => {
          const isRevoked = !!c.revoked_at
          return (
          <div
            key={c.id}
            data-testid="consent-row"
            className={`flex items-center justify-between p-3 rounded-lg border ${isRevoked ? 'border-border bg-surface opacity-60' : 'border-border bg-surface'}`}
            style={{ textDecoration: isRevoked ? 'line-through' : 'none' }}
          >
              <div className="flex items-center gap-3 text-sm">
                <Badge variant={isRevoked ? 'neutral' : 'success'}>
                  {CONSENT_TYPE_LABELS[c.type] ?? c.type}
                </Badge>
                <span className="text-neutral-600">
                  Concedido em: {new Date(c.granted_at).toLocaleDateString('pt-BR')}
                </span>
                {isRevoked && (
                  <span className="text-neutral-500">
                    | Revogado em: {new Date(c.revoked_at!).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>

              {!isRevoked && confirmRevoke === c.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">Tem certeza?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => revokeMutation.mutate(c.id)}
                    type="button"
                    disabled={revokeMutation.isPending}
                    loading={revokeMutation.isPending}
                  >
                    Sim, Revogar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmRevoke(null)} type="button">
                    Cancelar
                  </Button>
                </div>
              ) : (
                !isRevoked && (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(c.id)} type="button">
                    Revogar
                  </Button>
                )
              )}
            </div>
          )
        })}
      </div>

      {grantingType ? (
        <div className="flex items-center gap-3 mt-3 p-3 rounded-lg border border-border bg-neutral-50">
          <span className="text-sm text-neutral-700">
            Novo consentimento: <strong>{CONSENT_TYPE_LABELS[grantingType] ?? grantingType}</strong>
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => grantMutation.mutate(grantingType)}
            type="button"
            disabled={grantMutation.isPending}
            loading={grantMutation.isPending}
          >
            {grantMutation.isPending ? 'Concedendo...' : 'Confirmar'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setGrantingType(null)} type="button">
            Cancelar
          </Button>
        </div>
      ) : (
        availableTypes.length > 0 && (
          <div className="mt-3">
            <label htmlFor="grant-consent-type" className="block text-sm font-medium text-neutral-700 mb-1">
              Conceder consentimento:
            </label>
            <div className="flex items-end gap-2">
              <select
                id="grant-consent-type"
                value=""
                onChange={(e) => {
                  if (e.target.value) setGrantingType(e.target.value)
                }}
                className={inputClass}
              >
                <option value="">Selecione...</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {CONSENT_TYPE_LABELS[t] ?? t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )
      )}
    </div>
  )
}
