import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listEmitters, createEmitter, updateEmitter } from './fiscalApi'
import type { FiscalEmitter, PaginatedResponse } from './fiscalApi'
import { useTenant } from '@/tenant/TenantProvider'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

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
    <div data-testid="fiscal-config-page" className="p-6">
      <Card
        title="Emitentes Fiscais"
        actions={
          <Button variant="primary" size="sm" onClick={openCreate} data-testid="new-emitter-btn">
            Novo Emitente
          </Button>
        }
      >
        {message && <p data-testid="form-message" className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">{message}</p>}

        {showForm && (
          <div data-testid="emitter-form" className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-neutral-700">
              Filial:
              <input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))} data-testid="form-branch" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Provider:
              <input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} data-testid="form-provider" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              CPF/CNPJ:
              <input value={form.cpf_cnpj} onChange={e => setForm(f => ({ ...f, cpf_cnpj: e.target.value }))} data-testid="form-cpf-cnpj" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              IE:
              <input value={form.ie} onChange={e => setForm(f => ({ ...f, ie: e.target.value }))} data-testid="form-ie" className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </label>
            <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
              API Key:
              <input
                type="password"
                value={form.api_key}
                placeholder={apiKeyPlaceholder}
                onFocus={handleApiKeyFocus}
                onBlur={handleApiKeyBlur}
                onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                data-testid="form-api-key"
                className="mt-1 block w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </label>
            <div className="sm:col-span-2 flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={createMut.isPending || updateMut.isPending}
                onClick={() => (editingId ? updateMut.mutate() : createMut.mutate())}
                data-testid="submit-emitter-btn"
              >
                {editingId ? 'Atualizar' : 'Criar'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setShowForm(false); setEditingId(null) }} data-testid="cancel-form-btn">
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table data-testid="emitter-table" className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-border">
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Provider</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">CPF/CNPJ</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">IE</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-neutral-600"></th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map(e => (
                <tr key={e.id} data-testid="emitter-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 text-neutral-700">{e.provider}</td>
                  <td className="px-4 py-3 text-neutral-700">{e.cpf_cnpj}</td>
                  <td className="px-4 py-3 text-neutral-700">{e.ie}</td>
                  <td className="px-4 py-3">
                    <Badge variant={e.configured ? 'success' : 'warning'} testId={`configured-badge-${e.id}`}>
                      {e.configured ? 'Configurado' : 'Pendente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)} data-testid={`edit-emitter-${e.id}`}>
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