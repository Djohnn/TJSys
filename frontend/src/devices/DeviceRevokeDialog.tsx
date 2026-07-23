import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import { useTenant } from '@/tenant/TenantProvider'

interface DeviceRevokeDialogProps {
  deviceId: string
  deviceName: string
  onClose: () => void
}

export default function DeviceRevokeDialog({ deviceId, deviceName, onClose }: DeviceRevokeDialogProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [error, setError] = useState<string | null>(null)

  const revokeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/devices/${deviceId}/revoke/`, {
        method: 'POST',
        tenantId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', tenantId] })
      onClose()
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.correlationId) {
        setError(`Falha ao revogar dispositivo. Correlation ID: ${err.problem.correlationId}`)
      } else if (isApiProblemError(err)) {
        setError(err.problem.detail)
      } else {
        setError('Erro ao revogar dispositivo.')
      }
    },
  })

  return (
    <div data-testid="revoke-dialog" role="dialog" aria-modal="true">
      <p>Tem certeza que deseja revogar este dispositivo?</p>
      <p>
        <strong>{deviceName}</strong>
      </p>
      {error && <p data-testid="revoke-error">{error}</p>}
      <button onClick={onClose} disabled={revokeMutation.isPending} type="button">
        Cancelar
      </button>
      <button onClick={() => revokeMutation.mutate()} disabled={revokeMutation.isPending} type="button">
        {revokeMutation.isPending ? 'Revogando…' : 'Confirmar'}
      </button>
    </div>
  )
}
