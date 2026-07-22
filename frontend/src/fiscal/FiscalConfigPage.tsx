import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listEmitters, createEmitter, updateEmitter } from './fiscalApi'
import type { FiscalEmitter, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'

export default function FiscalConfigPage() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.id
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ branch: '', provider: '', cpf_cnpj: '', ie: '', api_key: '' })
  const [apiKeyPlaceholder, setApiKeyPlaceholder] = useState('••••••••')
  const [message, setMessage] = useState('')

  const { data, isLoading, isError } = useQuery<PaginatedResponse<FiscalEmitter>>({
    queryKey: ['fiscal-emitters', tenantId],
    queryFn: () => listEmitters({ tenantId }),
    enabled: !!tenantId,
  })

  const createMut = useMutation({
    mutationFn: () => createEmitter({ ...form, api_key: form.api_key || undefined }, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-emitters'] })
      setShowForm(false)
      resetForm()
      setMessage('Emitente criado com sucesso.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  const updateMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = { provider: form.provider, cpf_cnpj: form.cpf_cnpj, ie: form.ie }
      if (form.api_key) payload.api_key = form.api_key
      return updateEmitter(editingId!, payload, tenantId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-emitters'] })
      setShowForm(false)
      setEditingId(null)
      resetForm()
      setMessage('Emitente atualizado com sucesso.')
    },
    onError: (err: Error) => setMessage(err.message),
  })

  function resetForm() {
    setForm({ branch: '', provider: '', cpf_cnpj: '', ie: '', api_key: '' })
    setApiKeyPlaceholder('••••••••')
  }

  function openCreate() {
    resetForm()
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(emitter: FiscalEmitter) {
    setEditingId(emitter.id)
    setForm({ branch: emitter.branch, provider: emitter.provider, cpf_cnpj: emitter.cpf_cnpj, ie: emitter.ie, api_key: '' })
    setApiKeyPlaceholder('••••••••')
    setShowForm(true)
  }

  function handleApiKeyFocus() {
    if (!form.api_key) setApiKeyPlaceholder('')
  }

  function handleApiKeyBlur() {
    if (!form.api_key) setApiKeyPlaceholder('••••••••')
  }

  if (isLoading) return <p data-testid="loading-state">Carregando...</p>
  if (isError) return <p data-testid="error-state">Erro ao carregar emitentes.</p>

  return (
    <div data-testid="fiscal-config-page">
      <h2>Emitentes Fiscais</h2>
      {message && <p data-testid="form-message">{message}</p>}

      <button type="button" onClick={openCreate} data-testid="new-emitter-btn">
        Novo Emitente
      </button>

      {showForm && (
        <div data-testid="emitter-form">
          <label>
            Filial: <input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} data-testid="form-branch" />
          </label>
          <label>
            Provider: <input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} data-testid="form-provider" />
          </label>
          <label>
            CPF/CNPJ: <input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} data-testid="form-cpf-cnpj" />
          </label>
          <label>
            IE: <input value={form.ie} onChange={e => setForm(f => ({ ...f, ie: e.target.value }))} data-testid="form-ie" />
          </label>
          <label>
            API Key:
            <input
              type="password"
              value={form.api_key}
              placeholder={apiKeyPlaceholder}
              onFocus={handleApiKeyFocus}
              onBlur={handleApiKeyBlur}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              data-testid="form-api-key"
            />
          </label>
          <button
            type="button"
            disabled={createMut.isPending || updateMut.isPending}
            onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
            data-testid="submit-emitter-btn"
          >
            {editingId ? 'Atualizar' : 'Criar'}
          </button>
          <button type="button" onClick={() => { setShowForm(false); setEditingId(null) }} data-testid="cancel-form-btn">
            Cancelar
          </button>
        </div>
      )}

      <table data-testid="emitter-table">
        <thead>
          <tr><th>Provider</th><th>CPF/CNPJ</th><th>IE</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {data?.results.map(e => (
            <tr key={e.id} data-testid="emitter-row">
              <td>{e.provider}</td>
              <td>{e.cpf_cnpj}</td>
              <td>{e.ie}</td>
              <td><span data-testid={`configured-badge-${e.id}`}>{e.configured ? 'Configurado' : 'Pendente'}</span></td>
              <td><button type="button" onClick={() => openEdit(e)} data-testid={`edit-emitter-${e.id}`}>Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}