import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import type { PaginatedResponse } from './catalogApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export interface ServiceRow {
  id: string
  name: string
  sku: string
  billing_unit: string
  duration_minutes: number
  price: string
  is_active: boolean
}

export default function ServicesPage(): ReactNode {
  const { selectedTenant } = useTenant()
  const navigate = useNavigate()
  const tenantId = selectedTenant?.tenant_id ?? ''

  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['services', tenantId, q],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      params.set('product_kind', 'servico')
      params.set('page_size', '100')
      if (q) params.set('q', q)
      return apiRequest<PaginatedResponse<ServiceRow>>(`/catalog/products/?${params.toString()}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<ServiceRow>>
    },
    enabled: !!tenantId,
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setQ(searchInput)
  }

  if (isLoading) return <LoadingState message="Carregando serviços..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar serviços.</p>

  const services = data?.results ?? []

  return (
    <div data-testid="services-page" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-900">Serviços</h2>
        <Button onClick={() => navigate('/catalog/services/new')} variant="primary">Novo Serviço</Button>
      </div>

      <Card>
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <input
            aria-label="Buscar serviços"
            placeholder="Buscar por nome ou SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm"
          />
          <Button type="submit" size="sm" variant="secondary">Buscar</Button>
        </form>
      </Card>

      {services.length === 0 ? (
        <EmptyState
          title="Nenhum serviço"
          description="Cadastre seu primeiro serviço."
          action={
            <Button onClick={() => navigate('/catalog/services/new')} variant="primary">Criar Serviço</Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="services-table" className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-border">
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Nome</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Un. Cobrança</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Duração (min)</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Preço</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-neutral-600 whitespace-nowrap">Ações</th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id} data-testid="service-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 text-neutral-700">{service.sku || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{service.name}</td>
                    <td className="px-4 py-3 text-neutral-700">{service.billing_unit || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{service.duration_minutes || '-'}</td>
                    <td className="px-4 py-3 text-neutral-700">{service.price ? `R$ ${service.price}` : '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={service.is_active ? 'success' : 'neutral'}>{service.is_active ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button onClick={() => navigate(`/catalog/services/${service.id}/edit`)} variant="ghost" size="sm">Editar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
