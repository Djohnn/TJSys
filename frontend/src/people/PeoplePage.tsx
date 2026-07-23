import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { apiRequest } from '@/api/client'
import { isApiProblemError } from '@/api/problem'
import type { PaginatedResponse, PersonListItem } from './peopleApi'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import PersonForm from './PersonForm'
import type { PersonFormData } from './peopleSchemas'

const ROLE_LABELS: Record<string, string> = {
  customer: 'Cliente',
  supplier: 'Fornecedor',
  employee: 'Funcionário',
}

function maskDocument(doc: string | null | undefined): string {
  if (!doc) return '-'
  const digits = doc.replace(/\D/g, '')
  if (digits.length <= 3) return doc
  return `***.***.***-${digits.slice(-3)}`
}

interface PeoplePageProps {
  hasPiiPermission?: boolean
}

export default function PeoplePage({ hasPiiPermission = true }: PeoplePageProps) {
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showForm, setShowForm] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const tenantId = selectedTenant?.tenant_id ?? ''

  const page = Number(searchParams.get('page') ?? '1')
  const q = searchParams.get('q') ?? ''
  const role = searchParams.get('role') ?? ''
  const active = searchParams.get('active') ?? ''

  const { data, isLoading, isError } = useQuery({
    queryKey: ['people', tenantId, page, q, role, active],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (q) params.set('q', q)
      if (role) params.set('role', role)
      if (active) params.set('active', active)
      return apiRequest<PaginatedResponse<PersonListItem>>(`/people/?${params.toString()}`, {
        tenantId,
        signal,
      }) as Promise<PaginatedResponse<PersonListItem>>
    },
    enabled: !!tenantId,
  })

  const createMutation = useMutation({
    mutationFn: (body: PersonFormData) =>
      apiRequest<PersonListItem>('/people/', {
        method: 'POST',
        tenantId,
        body,
      }) as Promise<PersonListItem>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people', tenantId] })
      setShowForm(false)
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar pessoa.')
      }
    },
  })

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams)
    if (searchInput) {
      params.set('q', searchInput)
    } else {
      params.delete('q')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  function handleRoleChange(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('role', value)
    } else {
      params.delete('role')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  function handleActiveChange(value: string) {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('active', value)
    } else {
      params.delete('active')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  if (isLoading) return <LoadingState message="Carregando pessoas..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar pessoas.</p>

  const people = data?.results ?? []
  const totalPages = data ? Math.ceil(data.count / 25) : 1

  return (
    <div data-testid="people-page">
      <h2>Pessoas</h2>

      <form onSubmit={handleSearch}>
        <input
          aria-label="Buscar pessoas"
          placeholder="Buscar por nome ou documento..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>

      <div>
        <label htmlFor="filter-role">Função</label>
        <select
          id="filter-role"
          value={role}
          onChange={(e) => handleRoleChange(e.target.value)}
        >
          <option value="">Todas</option>
          <option value="customer">Cliente</option>
          <option value="supplier">Fornecedor</option>
          <option value="employee">Funcionário</option>
        </select>
      </div>

      <div>
        <label htmlFor="filter-active">Status</label>
        <select
          id="filter-active"
          value={active}
          onChange={(e) => handleActiveChange(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </div>

      {!showForm && people.length > 0 && (
        <button onClick={() => setShowForm(true)} type="button">
          Nova Pessoa
        </button>
      )}

      {showForm && (
        <PersonForm
          onSubmit={(data) => createMutation.mutate(data)}
          onCancel={() => { setShowForm(false); setSubmitError(null) }}
          isPending={createMutation.isPending}
          submitError={submitError}
          setSubmitError={setSubmitError}
        />
      )}

      {people.length === 0 && !showForm && (
        <EmptyState
          title="Nenhuma pessoa"
          description="Cadastre sua primeira pessoa para começar."
          action={
            <button onClick={() => setShowForm(true)} type="button">
              Criar Pessoa
            </button>
          }
        />
      )}

      {people.length > 0 && (
        <table data-testid="people-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Função</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id} data-testid="person-row">
                <td><Link to={`/people/${person.id}`}>{person.name}</Link></td>
                <td>{hasPiiPermission ? person.document : maskDocument(person.document)}</td>
                <td>{person.person_type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</td>
                <td>{ROLE_LABELS[person.role] ?? person.role}</td>
                <td>{person.is_active ? 'Ativo' : 'Inativo'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação">
          <button disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page - 1))
            setSearchParams(params)
          }} type="button">
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => {
            const params = new URLSearchParams(searchParams)
            params.set('page', String(page + 1))
            setSearchParams(params)
          }} type="button">
            Próxima
          </button>
        </nav>
      )}
    </div>
  )
}
