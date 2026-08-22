import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './inventoryApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface StorageType {
  id: string
  name: string
  description: string
  temperature_min: number | null
  temperature_max: number | null
  requires_refrigeration: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function StorageTypesPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['storage-types', tenantId, page, q],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<StorageType>>(`/inventory/storage-types/?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<StorageType>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando tipos de estocagem..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar tipos de estocagem.</p>

  const storageTypes = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="storage-types-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Tipos de Estocagem</h2>
      </div>

      {storageTypes.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="storagetype-search-input"
          />
        </div>
      )}

      {storageTypes.length === 0 && (
        <EmptyState
          title="Nenhum tipo de estocagem"
          description="Crie um tipo de estocagem para começar."
        />
      )}

      {storageTypes.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="storage-types-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Refrigeração</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Temperatura</th>
                </tr>
              </thead>
              <tbody>
                {storageTypes.map((storageType) => (
                  <tr key={storageType.id} data-testid="storagetype-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-medium">{storageType.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={storageType.is_active ? 'success' : 'danger'}>
                        {storageType.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={storageType.requires_refrigeration ? 'warning' : 'neutral'}>
                        {storageType.requires_refrigeration ? 'Sim' : 'Não'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {storageType.temperature_min !== null && storageType.temperature_max !== null
                        ? `${storageType.temperature_min}°C a ${storageType.temperature_max}°C`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Página {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} variant="secondary" size="sm">Próxima</Button>
        </nav>
      )}
    </div>
  )
}
