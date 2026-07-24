import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from '@/organization/organizationApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
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

  if (isLoading) return <LoadingState />
  if (isError) return <p data-testid="error-state" className="p-4 text-danger">Erro ao carregar dispositivos.</p>

  const devices = data?.results ?? []

  if (devices.length === 0) {
    return (
      <div data-testid="devices-page" className="p-6">
        <Card title="Dispositivos">
          <EmptyState
            title="Nenhum dispositivo"
            description="Nenhum dispositivo encontrado."
          />
        </Card>
      </div>
    )
  }

  const revokingDevice = revokingId ? { id: revokingId, name: revokingName } : null

  return (
    <div data-testid="devices-page" className="p-6">
      <Card title="Dispositivos">
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-neutral-700">Filtro:</label>
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
            className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="devices-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Nome</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Device ID</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Plataforma</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">App Version</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">SO</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Último Acesso</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} data-testid="device-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{device.name}</td>
                  <td className="px-4 py-3 text-neutral-700 font-mono">{truncateDeviceId(device.device_id)}</td>
                  <td className="px-4 py-3 text-neutral-700">{device.platform}</td>
                  <td className="px-4 py-3 text-neutral-700">{device.app_version}</td>
                  <td className="px-4 py-3 text-neutral-700">{device.os_version}</td>
                  <td className="px-4 py-3 text-neutral-700">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('pt-BR') : '-'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={device.status === 'active' ? 'success' : 'danger'}>{device.status === 'active' ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setRevokingId(device.id)
                        setRevokingName(device.name)
                      }}
                    >
                      Revogar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
      </Card>
    </div>
  )
}
