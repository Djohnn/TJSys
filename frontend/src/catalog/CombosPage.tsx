import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchCombos } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function CombosPage() {
  const { selectedTenant } = useTenant()
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['combos', tenantId, page, q],
    queryFn: ({ signal }) => fetchCombos(tenantId, { page, q: q || undefined }, signal),
    enabled: !!tenantId,
  })

  if (isLoading) return <LoadingState message="Carregando combos..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar combos.</p>

  const combos = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="combos-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Combos Comerciais</h2>
        <Link to="/catalog/combos/new">
          <Button variant="primary">Novo Combo</Button>
        </Link>
      </div>

      {combos.length > 0 && (
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar por nome ou SKU..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-border rounded-lg text-sm"
            data-testid="combo-search-input"
          />
        </div>
      )}

      {combos.length === 0 && (
        <EmptyState
          title="Nenhum combo"
          description="Crie seu primeiro combo comercial para começar."
          action={
            <Link to="/catalog/combos/new">
              <Button variant="primary">Criar Combo</Button>
            </Link>
          }
        />
      )}

      {combos.length > 0 && (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="combos-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Preco</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Itens</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => (
                  <tr key={combo.id} data-testid="combo-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700 font-mono text-xs">{combo.sku}</td>
                    <td className="px-4 py-3 text-neutral-700">{combo.name}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      {Number(combo.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{combo.items?.length ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={combo.is_active ? 'success' : 'neutral'}>{combo.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/catalog/combos/${combo.id}/edit`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginacao" className="flex items-center justify-center gap-3">
          <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} variant="secondary" size="sm">Anterior</Button>
          <span className="text-sm text-neutral-600">Pagina {page} de {totalPages}</span>
          <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} variant="secondary" size="sm">Proxima</Button>
        </nav>
      )}
    </div>
  )
}
