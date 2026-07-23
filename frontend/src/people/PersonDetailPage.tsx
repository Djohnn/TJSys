import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { isApiProblemError } from '@/api/problem'
import { fetchPerson, deactivatePerson } from './peopleApi'
import LoadingState from '@/components/LoadingState'
import AddressesSection from './AddressesSection'
import ContactsSection from './ContactsSection'
import ConsentsSection from './ConsentsSection'

const ROLE_LABELS: Record<string, string> = {
  customer: 'Cliente',
  supplier: 'Fornecedor',
  employee: 'Funcionário',
}

function maskPII(value: string | null | undefined): string {
  if (!value) return '-'
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 3) return value
  return `***.***.***-${digits.slice(-3)}`
}

interface PersonDetailPageProps {
  hasPiiPermission?: boolean
}

export default function PersonDetailPage({ hasPiiPermission = true }: PersonDetailPageProps): ReactNode {
  const { id } = useParams<{ id: string }>()
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [deactivateSuccess, setDeactivateSuccess] = useState(false)

  const { data: person, isLoading, isError } = useQuery({
    queryKey: ['person', tenantId, id],
    queryFn: ({ signal }) => fetchPerson(tenantId, id!, signal),
    enabled: !!tenantId && !!id,
  })

  const deactivateMutation = useMutation({
    mutationFn: () => deactivatePerson(tenantId, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', tenantId, id] })
      queryClient.invalidateQueries({ queryKey: ['people', tenantId] })
      setConfirmDeactivate(false)
      setDeactivateError(null)
      setDeactivateSuccess(true)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setDeactivateError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setDeactivateError(err.problem.detail)
      } else {
        setDeactivateError('Erro ao desativar pessoa.')
      }
    },
  })

  if (isLoading) return <LoadingState message="Carregando pessoa..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar pessoa.</p>
  if (!person) return <p data-testid="error-state">Pessoa não encontrada.</p>

  return (
    <div data-testid="person-detail-page">
      <h2>{person.person_type === 'PF' ? person.name : person.company_name}</h2>

      {deactivateSuccess && (
        <div data-testid="deactivate-success" style={{ color: 'green' }}>
          Pessoa desativada com sucesso.
        </div>
      )}

      <div data-testid="person-info">
        <p><strong>Tipo:</strong> {person.person_type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
        {person.person_type === 'PF' ? (
          <>
            <p><strong>Nome:</strong> {person.name}</p>
            <p><strong>CPF:</strong> {hasPiiPermission ? (person.cpf ?? '-') : maskPII(person.cpf)}</p>
            <p><strong>RG:</strong> {hasPiiPermission ? (person.rg ?? '-') : maskPII(person.rg)}</p>
          </>
        ) : (
          <>
            <p><strong>Razão Social:</strong> {person.company_name ?? '-'}</p>
            <p><strong>Nome Fantasia:</strong> {person.trade_name ?? '-'}</p>
            <p><strong>CNPJ:</strong> {hasPiiPermission ? (person.cnpj ?? '-') : maskPII(person.cnpj)}</p>
            <p><strong>IE:</strong> {person.ie ?? '-'}</p>
          </>
        )}
        <p><strong>Função:</strong> {ROLE_LABELS[person.role] ?? person.role}</p>
        <p><strong>Status:</strong> {person.is_active ? 'Ativo' : 'Inativo'}</p>
      </div>

      {deactivateError && (
        <div data-testid="deactivate-error" style={{ color: 'red' }}>
          {deactivateError}
        </div>
      )}

      {person.is_active && !confirmDeactivate && (
        <button onClick={() => setConfirmDeactivate(true)} type="button" data-testid="deactivate-btn">
          Desativar Pessoa
        </button>
      )}

      {confirmDeactivate && (
        <div data-testid="deactivate-confirm">
          <p>Tem certeza que deseja desativar esta pessoa?</p>
          <button
            onClick={() => deactivateMutation.mutate()}
            type="button"
            disabled={deactivateMutation.isPending}
            data-testid="confirm-deactivate-btn"
          >
            {deactivateMutation.isPending ? 'Desativando...' : 'Sim, Desativar'}
          </button>
          <button onClick={() => setConfirmDeactivate(false)} type="button">
            Cancelar
          </button>
        </div>
      )}

      <AddressesSection personId={person.id} addresses={person.addresses} />
      <ContactsSection personId={person.id} contacts={person.contacts} />
      <ConsentsSection personId={person.id} consents={person.consents} />
    </div>
  )
}
