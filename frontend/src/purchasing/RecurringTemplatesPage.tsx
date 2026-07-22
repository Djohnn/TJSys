import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import { fetchTemplates, toggleTemplate } from './receivingApi'

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
}

export default function RecurringTemplatesPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['templates', tenantId],
    queryFn: ({ signal }) => fetchTemplates(tenantId, {}, signal),
    enabled: !!tenantId,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ templateId, isActive }: { templateId: string; isActive: boolean }) =>
      toggleTemplate(tenantId, templateId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', tenantId] })
    },
  })

  if (isLoading) return <LoadingState message="Carregando templates..." />
  if (isError) return <p data-testid="error-state">Erro ao carregar templates.</p>

  const templates = data?.results ?? []

  if (templates.length === 0) {
    return (
      <div data-testid="templates-page">
        <h2>Templates Recorrentes</h2>
        <EmptyState title="Nenhum template" description="Nenhum template encontrado." />
      </div>
    )
  }

  return (
    <div data-testid="templates-page">
      <h2>Templates Recorrentes</h2>

      <table data-testid="templates-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Fornecedor</th>
            <th>Frequência</th>
            <th>Próxima Data</th>
            <th>Ativo</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((tmpl) => (
            <tr key={tmpl.id} data-testid="template-row">
              <td>{tmpl.name}</td>
              <td>{tmpl.supplier_name}</td>
              <td>{FREQUENCY_LABELS[tmpl.frequency] ?? tmpl.frequency}</td>
              <td>{tmpl.next_date}</td>
              <td>
                <input
                  type="checkbox"
                  checked={tmpl.is_active}
                  onChange={() =>
                    toggleMutation.mutate({
                      templateId: tmpl.id,
                      isActive: !tmpl.is_active,
                    })
                  }
                  data-testid={`toggle-template-${tmpl.id}`}
                />
                {tmpl.is_active ? 'Sim' : 'Não'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
