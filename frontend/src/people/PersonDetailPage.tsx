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
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

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
      <Card>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">
              {person.person_type === 'PF' ? person.name : person.company_name}
            </h2>
            <Badge variant={person.is_active ? 'success' : 'neutral'} className="mt-2">
              {person.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>

          {deactivateSuccess && (
            <div data-testid="deactivate-success" className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              Pessoa desativada com sucesso.
            </div>
          )}

          <div data-testid="person-info" className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p><span className="font-medium text-neutral-700">Tipo:</span> {person.person_type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
              {person.person_type === 'PF' ? (
                <>
                  <p><span className="font-medium text-neutral-700">Nome:</span> {person.name}</p>
                  <p><span className="font-medium text-neutral-700">CPF:</span> {hasPiiPermission ? (person.cpf ?? '-') : maskPII(person.cpf)}</p>
                  <p><span className="font-medium text-neutral-700">RG:</span> {hasPiiPermission ? (person.rg ?? '-') : maskPII(person.rg)}</p>
                </>
              ) : (
                <>
                  <p><span className="font-medium text-neutral-700">Razão Social:</span> {person.company_name ?? '-'}</p>
                  <p><span className="font-medium text-neutral-700">Nome Fantasia:</span> {person.trade_name ?? '-'}</p>
                  <p><span className="font-medium text-neutral-700">CNPJ:</span> {hasPiiPermission ? (person.cnpj ?? '-') : maskPII(person.cnpj)}</p>
                  <p><span className="font-medium text-neutral-700">IE:</span> {person.ie ?? '-'}</p>
                </>
              )}
              <p><span className="font-medium text-neutral-700">Função:</span> {ROLE_LABELS[person.role] ?? person.role}</p>
            </div>
          </div>

          {deactivateError && (
            <div data-testid="deactivate-error" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {deactivateError}
            </div>
          )}

          {person.is_active && !confirmDeactivate && (
            <Button variant="danger" onClick={() => setConfirmDeactivate(true)} type="button" data-testid="deactivate-btn">
              Desativar Pessoa
            </Button>
          )}

          {confirmDeactivate && (
            <div data-testid="deactivate-confirm" className="p-4 rounded-lg border border-border bg-neutral-50 space-y-3">
              <p className="text-sm text-neutral-700">Tem certeza que deseja desativar esta pessoa?</p>
              <div className="flex gap-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => deactivateMutation.mutate()}
                  type="button"
                  disabled={deactivateMutation.isPending}
                  loading={deactivateMutation.isPending}
                  data-testid="confirm-deactivate-btn"
                >
                  {deactivateMutation.isPending ? 'Desativando...' : 'Sim, Desativar'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDeactivate(false)} type="button">
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border space-y-6">
            <AddressesSection personId={person.id} addresses={person.addresses} />
            <ContactsSection personId={person.id} contacts={person.contacts} />
            <ConsentsSection personId={person.id} consents={person.consents} />
          </div>
        </div>
      </Card>
    </div>
  )
}
