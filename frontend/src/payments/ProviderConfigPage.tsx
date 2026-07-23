import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listProviderConfigs, createProviderConfig, updateProviderConfig } from './paymentsApi'
import type { PaymentProviderConfig, PaginatedResponse } from './paymentsApi'
import { useTenant } from '@/tenant/TenantProvider'

export default function ProviderConfigPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
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
    <div data-testid="provider-config-page">
      <h2>Providers de Pagamento</h2>
      {message && <p data-testid="form-message">{message}</p>}

      <button type="button" onClick={openCreate} data-testid="new-provider-btn">
        Novo Provider
      </button>

      {showForm && (
        <div data-testid="provider-config-form">
          {!editingId && (
            <label>
              Provider:{' '}
              <input
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                data-testid="form-provider-name"
              />
            </label>
          )}
          <label>
            Secret:{' '}
            <input
              type="password"
              value={form.secret}
              placeholder={secretPlaceholder}
              onFocus={handleSecretFocus}
              onBlur={handleSecretBlur}
              onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
              data-testid="provider-secret-input"
            />
          </label>
          <button
            type="button"
            disabled={createMut.isPending || updateMut.isPending}
            onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
            data-testid="submit-provider-btn"
          >
            {editingId ? 'Atualizar' : 'Criar'}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setEditingId(null) }}
            data-testid="cancel-form-btn"
          >
            Cancelar
          </button>
        </div>
      )}

      <table data-testid="provider-config-table">
        <thead>
          <tr><th>Provider</th><th>Status</th><th>Configurado</th><th></th></tr>
        </thead>
        <tbody>
          {data?.results.map(cfg => (
            <tr key={cfg.id} data-testid="provider-config-row">
              <td>{cfg.provider}</td>
              <td>{cfg.is_active ? 'Ativo' : 'Inativo'}</td>
              <td>
                <span data-testid={`configured-badge-${cfg.id}`}>
                  {cfg.configured ? 'Configurado' : 'Pendente'}
                </span>
              </td>
              <td>
                <button type="button" onClick={() => openEdit(cfg)} data-testid={`edit-provider-${cfg.id}`}>
                  Editar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}