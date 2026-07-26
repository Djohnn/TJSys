import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProviderConfigs, createProviderConfig, updateProviderConfig } from './paymentsApi'
import type { PaymentProviderConfig, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

export default function ProviderConfigPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ provider: '', secret: '' })
  const [secretPlaceholder, setSecretPlaceholder] = useState('••••••••')
  const [message, setMessage] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedResponse<PaymentProviderConfig>>({
    queryKey: ['payment-provider-configs', tenantId],
    queryFn: () => listProviderConfigs({ tenantId }),
    enabled: !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: () => createProviderConfig({ provider: form.provider, secret: form.secret || undefined }, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-provider-configs'] })
      setShowForm(false)
      resetForm()
      setMessage('Provider configurado com sucesso.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  const updateMut = useMutation({
    mutationFn: () => updateProviderConfig(editingId!, { secret: form.secret || undefined }, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-provider-configs'] })
      setShowForm(false)
      setEditingId(null)
      resetForm()
      setMessage('Provider atualizado com sucesso.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  function resetForm() {
    setForm({ provider: '', secret: '' })
    setSecretPlaceholder('••••••••')
  }

  function openCreate() {
    resetForm()
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(config: PaymentProviderConfig) {
    setEditingId(config.id)
    setForm({ provider: config.provider, secret: '' })
    setSecretPlaceholder('••••••••')
    setShowForm(true)
  }

  function handleSecretFocus() {
    if (!form.secret) setSecretPlaceholder('')
  }

  function handleSecretBlur() {
    if (!form.secret) setSecretPlaceholder('••••••••')
  }

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar providers.</p>

  return (
    <div data-testid="provider-config-page" className="p-6">
      <Card
        title="Providers de Pagamento"
        actions={
          <Button variant="primary" size="sm" onClick={openCreate} data-testid="new-provider-btn">
            Novo Provider
          </Button>
        }
      >
        {message && <p data-testid="form-message" className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{message}</p>}

        {showForm && (
          <div data-testid="provider-config-form" className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!editingId && (
              <label className="text-sm font-medium text-neutral-700">
                Provider:
                <input
                  value={form.provider}
                  onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                  data-testid="form-provider-name"
                  className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </label>
            )}
            <label className={'text-sm font-medium text-neutral-700' + (editingId ? ' sm:col-span-2' : '')}>
              Secret:
              <input
                type="password"
                value={form.secret}
                placeholder={secretPlaceholder}
                onFocus={handleSecretFocus}
                onBlur={handleSecretBlur}
                onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                data-testid="provider-secret-input"
                className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={createMut.isPending || updateMut.isPending}
                onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
                data-testid="submit-provider-btn"
              >
                {editingId ? 'Atualizar' : 'Criar'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowForm(false); setEditingId(null) }}
                data-testid="cancel-form-btn"
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="provider-config-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Configurado</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(cfg => (
                <tr key={cfg.id} data-testid="provider-config-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{cfg.provider}</td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.is_active ? 'success' : 'danger'}>{cfg.is_active ? 'Ativo' : 'Inativo'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={cfg.configured ? 'success' : 'warning'} testId={`configured-badge-${cfg.id}`}>
                      {cfg.configured ? 'Configurado' : 'Pendente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cfg)} data-testid={`edit-provider-${cfg.id}`}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
