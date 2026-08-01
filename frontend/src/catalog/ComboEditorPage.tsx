import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchCombo,
  createCombo,
  updateCombo,
  addComboItem,
  removeComboItem,
  fetchProducts,
} from './catalogApi'
import type { CommercialComboItem } from './catalogApi'
import { isApiProblemError } from '@/api/problem'
import LoadingState from '@/components/LoadingState'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface ComboFormData {
  sku: string
  name: string
  description: string
  price: string
  valid_from: string
  valid_to: string
}

function toLocalISO(dt: string): string {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  return d.toISOString().slice(0, 16)
}

export default function ComboEditorPage() {
  const { comboId } = useParams<{ comboId: string }>()
  const navigate = useNavigate()
  const { selectedTenant } = useTenant()
  const queryClient = useQueryClient()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const isEdit = !!comboId

  const [form, setForm] = useState<ComboFormData>({
    sku: '', name: '', description: '', price: '0', valid_from: '', valid_to: '',
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemProduct, setNewItemProduct] = useState('')
  const [newItemQty, setNewItemQty] = useState('1')
  const [itemError, setItemError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'items'>('details')

  const { data: combo, isLoading: comboLoading } = useQuery({
    queryKey: ['combo', tenantId, comboId],
    queryFn: () => fetchCombo(tenantId, comboId!),
    enabled: isEdit && !!tenantId,
  })

  const { data: products } = useQuery({
    queryKey: ['products', tenantId, 'combo-editor'],
    queryFn: ({ signal }) => fetchProducts(tenantId, {}, signal),
    enabled: !!tenantId,
  })

  const comboLoaded = combo && isEdit
  const effectiveForm = comboLoaded
    ? {
        sku: combo.sku,
        name: combo.name,
        description: combo.description,
        price: combo.price,
        valid_from: toLocalISO(combo.valid_from),
        valid_to: toLocalISO(combo.valid_to ?? ''),
      }
    : form

  const items: CommercialComboItem[] = combo?.items ?? []

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => createCombo(tenantId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['combos', tenantId] })
      navigate(`/catalog/combos/${data.id}/edit`, { replace: true })
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao criar combo.')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateCombo(tenantId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo', tenantId, comboId] })
      queryClient.invalidateQueries({ queryKey: ['combos', tenantId] })
      setSubmitError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err) && err.problem.errors) {
        setSubmitError(Object.values(err.problem.errors).flat().join(', '))
      } else if (isApiProblemError(err)) {
        setSubmitError(err.problem.detail)
      } else {
        setSubmitError('Erro ao atualizar combo.')
      }
    },
  })

  const addItemMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      addComboItem(tenantId, comboId!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo', tenantId, comboId] })
      queryClient.invalidateQueries({ queryKey: ['combos', tenantId] })
      setNewItemProduct('')
      setNewItemQty('1')
      setAddingItem(false)
      setItemError(null)
    },
    onError: (err) => {
      if (isApiProblemError(err)) {
        setItemError(err.problem.detail)
      } else {
        setItemError('Erro ao adicionar item.')
      }
    },
  })

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => removeComboItem(tenantId, comboId!, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['combo', tenantId, comboId] })
      queryClient.invalidateQueries({ queryKey: ['combos', tenantId] })
    },
  })

  if (isEdit && comboLoading) return <LoadingState message="Carregando combo..." />

  function handleFieldChange(field: keyof ComboFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    setSubmitError(null)
    const data = comboLoaded ? effectiveForm : form
    const body: Record<string, unknown> = {
      sku: data.sku,
      name: data.name,
      description: data.description,
      price: data.price,
      valid_from: data.valid_from ? new Date(data.valid_from).toISOString() : null,
      valid_to: data.valid_to ? new Date(data.valid_to).toISOString() : null,
    }
    if (isEdit && comboId) {
      updateMutation.mutate({ id: comboId, body })
    } else {
      createMutation.mutate(body)
    }
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    setItemError(null)
    if (!newItemProduct) return
    addItemMutation.mutate({
      item: newItemProduct,
      quantity: newItemQty,
    })
  }

  const pageTitle = isEdit ? `Editar Combo${combo ? `: ${combo.sku}` : ''}` : 'Novo Combo'

  return (
    <div data-testid="combo-editor-page" className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="secondary" size="sm" onClick={() => navigate('/catalog/combos')}>Voltar</Button>
        <h2 className="text-2xl font-bold text-neutral-900">{pageTitle}</h2>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          data-testid="combo-tab-details"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => setActiveTab('details')}
        >
          Detalhes
        </button>
        {isEdit && (
          <button
            data-testid="combo-tab-items"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'items' ? 'border-primary-600 text-primary-600' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}
            onClick={() => setActiveTab('items')}
          >
            Itens ({items.length})
          </button>
        )}
      </div>

      {activeTab === 'details' && (
        <Card data-testid="combo-details-form">
          <div className="space-y-4">
            {submitError && (
              <div data-testid="form-error" role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="combo-sku" className="block text-sm font-medium text-neutral-700 mb-1">SKU</label>
                <input
                  id="combo-sku"
                  data-testid="combo-sku-input"
                  value={effectiveForm.sku}
                  onChange={(e) => handleFieldChange('sku', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="combo-name" className="block text-sm font-medium text-neutral-700 mb-1">Nome</label>
                <input
                  id="combo-name"
                  data-testid="combo-name-input"
                  value={effectiveForm.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="combo-price" className="block text-sm font-medium text-neutral-700 mb-1">Preco</label>
                <input
                  id="combo-price"
                  data-testid="combo-price-input"
                  type="number"
                  step="0.01"
                  value={effectiveForm.price}
                  onChange={(e) => handleFieldChange('price', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="combo-valid-from" className="block text-sm font-medium text-neutral-700 mb-1">Valido de</label>
                <input
                  id="combo-valid-from"
                  data-testid="combo-valid-from-input"
                  type="datetime-local"
                  value={effectiveForm.valid_from}
                  onChange={(e) => handleFieldChange('valid_from', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
              <div>
                <label htmlFor="combo-valid-to" className="block text-sm font-medium text-neutral-700 mb-1">Valido ate (opcional)</label>
                <input
                  id="combo-valid-to"
                  data-testid="combo-valid-to-input"
                  type="datetime-local"
                  value={effectiveForm.valid_to}
                  onChange={(e) => handleFieldChange('valid_to', e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                />
              </div>
            </div>
            <div>
              <label htmlFor="combo-description" className="block text-sm font-medium text-neutral-700 mb-1">Descricao</label>
              <textarea
                id="combo-description"
                data-testid="combo-description-input"
                rows={3}
                value={effectiveForm.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-y"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} loading={createMutation.isPending || updateMutation.isPending}>
                {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={() => navigate('/catalog/combos')}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'items' && isEdit && (
        <div className="space-y-6">
          <Card data-testid="combo-items-section">
            <div className="space-y-4">
              {items.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table data-testid="combo-items-table" className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 border-b border-border">
                        <th className="px-4 py-3 text-left font-semibold text-neutral-600">Produto</th>
                        <th className="px-4 py-3 text-left font-semibold text-neutral-600">Quantidade</th>
                        <th className="px-4 py-3 text-left font-semibold text-neutral-600">Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.filter((i) => i.is_active).map((item) => (
                        <tr key={item.id} data-testid="combo-item-row" className="border-b border-border last:border-0 hover:bg-neutral-50 transition-colors">
                          <td className="px-4 py-3 text-neutral-700">
                            {item.item_name ?? item.item}
                          </td>
                          <td className="px-4 py-3 text-neutral-700">{item.quantity}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`remove-item-${item.id}`}
                              onClick={() => removeItemMutation.mutate(item.id)}
                              disabled={removeItemMutation.isPending}
                            >
                              Remover
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {items.filter((i) => i.is_active).length === 0 && (
                <p className="text-sm text-neutral-500" data-testid="no-items-msg">Nenhum item adicionado.</p>
              )}
            </div>
          </Card>

          {!addingItem ? (
            <Button variant="secondary" data-testid="add-item-btn" onClick={() => setAddingItem(true)}>
              Adicionar Item
            </Button>
          ) : (
            <Card data-testid="add-item-form">
              <form onSubmit={handleAddItem} className="space-y-4">
                {itemError && (
                  <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {itemError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="combo-item-product" className="block text-sm font-medium text-neutral-700 mb-1">Produto</label>
                    <select
                      id="combo-item-product"
                      data-testid="combo-item-product-select"
                      value={newItemProduct}
                      onChange={(e) => setNewItemProduct(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    >
                      <option value="">Selecione...</option>
                      {(products?.results ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="combo-item-qty" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade</label>
                    <input
                      id="combo-item-qty"
                      data-testid="combo-item-qty-input"
                      type="number"
                      step="0.000001"
                      min="0.000001"
                      value={newItemQty}
                      onChange={(e) => setNewItemQty(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={addItemMutation.isPending || !newItemProduct} loading={addItemMutation.isPending}>
                    {addItemMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => { setAddingItem(false); setItemError(null) }} disabled={addItemMutation.isPending}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
