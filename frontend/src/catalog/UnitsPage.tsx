import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Unit } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

export default function UnitsPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['units', tenantId, page],
    queryFn: ({ signal }) =>
      apiRequest<PaginatedResponse<Unit>>(`/catalog/units/?page=${page}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<Unit>>,
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando unidades..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar unidades.</p>

  const units = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="units-page" className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900">Unidades</h2>

      {units.length === 0 && (
        <EmptyState
          title="Nenhuma unidade"
          description="Nenhuma unidade de medida cadastrada."
        />
      )}

      {units.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="units-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Abreviação</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} data-testid="unit-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{unit.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{unit.abbreviation}</td>
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
