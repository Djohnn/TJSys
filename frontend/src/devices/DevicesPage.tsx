import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import DeviceRevokeDialog from './DeviceRevokeDialog'

interface Device {
  id: string
  name: string
  device_id: string
  platform: string
  app_version: string
  os_version: string
  last_seen_at: string | null
  status: string
  branch_name: string
  registered_at: string
}

function truncateDeviceId(deviceId: string): string {
  return deviceId.length > 8 ? deviceId.slice(0, 8) : deviceId
}

export default function DevicesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokingName, setRevokingName] = useState<string>('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['devices', tenantId, statusFilter],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const qs = params.toString()
      return apiRequest<PaginatedResponse<Device>>(`/devices/list/${qs ? `?${qs}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Device>>
    },
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando dispositivos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar dispositivos.</p>

  const devices = data?.results ?? []

  if (devices.length === 0) {
    return (
      <div data-testid="devices-page">
        <h2>Dispositivos</h2>
        <EmptyState
          title="Nenhum dispositivo"
          description="Nenhum dispositivo encontrado."
        />
      </div>
    )
  }

  const revokingDevice = revokingId ? { id: revokingId, name: revokingName } : null

  return (
    <div data-testid="devices-page">
      <h2>Dispositivos</h2>

      <div>
        <label>
          Filtro:
          <select
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value
              if (value) {
                setSearchParams({ status: value })
              } else {
                setSearchParams({})
              }
            }}
          >
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </label>
      </div>

      <table data-testid="devices-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Device ID</th>
            <th>Plataforma</th>
            <th>App Version</th>
            <th>SO</th>
            <th>Último Acesso</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} data-testid="device-row">
              <td>{device.name}</td>
              <td>{truncateDeviceId(device.device_id)}</td>
              <td>{device.platform}</td>
              <td>{device.app_version}</td>
              <td>{device.os_version}</td>
              <td>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('pt-BR') : '-'}</td>
              <td>{device.status === 'active' ? 'Ativo' : 'Inativo'}</td>
              <td>
                <button
                  onClick={() => {
                    setRevokingId(device.id)
                    setRevokingName(device.name)
                  }}
                  type="button"
                >
                  Revogar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {revokingDevice && (
        <DeviceRevokeDialog
          deviceId={revokingDevice.id}
          deviceName={revokingDevice.name}
          onClose={() => {
            setRevokingId(null)
            setRevokingName('')
          }}
        />
      )}
    </div>
  )
}
