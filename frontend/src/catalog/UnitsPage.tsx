import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse, Unit } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'

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
    <div data-testid="units-page">
      <h2>Unidades</h2>

      {units.length === 0 && (
        <EmptyState
          title="Nenhuma unidade"
          description="Nenhuma unidade de medida cadastrada."
        />
      )}

      {units.length > 0 && (
        <table data-testid="units-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Abreviação</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id} data-testid="unit-row">
                <td>{unit.name}</td>
                <td>{unit.abbreviation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
