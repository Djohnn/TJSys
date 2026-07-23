import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { grantConsent, revokeConsent } from './peopleApi'
import type { Consent } from './peopleApi'

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

  return (
    <div data-testid="consents-section">
      <h3>Consentimentos</h3>
      {error && <div style={{ color: 'red' }}>{error}</div>}

      {consents.length === 0 && <p>Nenhum consentimento registrado.</p>}

      {consents.map((c) => {
        const isRevoked = !!c.revoked_at
        return (
          <div
            key={c.id}
            data-testid="consent-row"
            style={{ textDecoration: isRevoked ? 'line-through' : 'none', opacity: isRevoked ? 0.6 : 1 }}
          >
            <span>{CONSENT_TYPE_LABELS[c.type] ?? c.type}</span>
            <span> - Concedido em: {new Date(c.granted_at).toLocaleDateString('pt-BR')}</span>
            {isRevoked && (
              <span> | Revogado em: {new Date(c.revoked_at!).toLocaleDateString('pt-BR')}</span>
            )}
            {!isRevoked && confirmRevoke === c.id ? (
              <span>
                <span> Tem certeza? </span>
                <button
                  onClick={() => revokeMutation.mutate(c.id)}
                  type="button"
                  disabled={revokeMutation.isPending}
                >
                  Sim, Revogar
                </button>
                <button onClick={() => setConfirmRevoke(null)} type="button">
                  Cancelar
                </button>
              </span>
            ) : (
              !isRevoked && (
                <button onClick={() => setConfirmRevoke(c.id)} type="button">
                  Revogar
                </button>
              )
            )}
          </div>
        )
      })}

      {grantingType ? (
        <div>
          <span>Novo consentimento: {CONSENT_TYPE_LABELS[grantingType] ?? grantingType}</span>
          <button
            onClick={() => grantMutation.mutate(grantingType)}
            type="button"
            disabled={grantMutation.isPending}
          >
            {grantMutation.isPending ? 'Concedendo...' : 'Confirmar'}
          </button>
          <button onClick={() => setGrantingType(null)} type="button">
            Cancelar
          </button>
        </div>
      ) : (
        availableTypes.length > 0 && (
          <div>
            <label htmlFor="grant-consent-type">Conceder consentimento:</label>
            <select
              id="grant-consent-type"
              value=""
              onChange={(e) => {
                if (e.target.value) setGrantingType(e.target.value)
              }}
            >
              <option value="">Selecione...</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {CONSENT_TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
          </div>
        )
      )}
    </div>
  )
}
