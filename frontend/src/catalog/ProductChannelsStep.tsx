import { useState, useCallback } from 'react'
import type { ReactNode, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import {
  fetchChannelProfiles,
  createChannelProfile,
  saveChannelProfile,
  publishChannel,
} from './catalogApi'
import type { ChannelProfile } from './catalogApi'

interface ProductChannelsStepProps {
  productId: string
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  ready: 'Pronto',
  published: 'Publicado',
  failed: 'Falhou',
}

const STATUS_BADGE_COLOR: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-700',
  ready: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

const CHANNELS = ['mercadolivre', 'shopee', 'amazon', 'magalu', 'shein', 'nuvemshop'] as const

export default function ProductChannelsStep({ productId }: ProductChannelsStepProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()

  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [publishError, setPublishError] = useState<string | null>(null)

  const { data: profiles = [], isLoading, isError } = useQuery({
    queryKey: ['channel-profiles', tenantId, productId],
    queryFn: () => fetchChannelProfiles(tenantId, productId),
    enabled: !!tenantId && !!productId,
  })

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => createChannelProfile(tenantId, productId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-profiles', tenantId, productId] })
    },
  })

  const saveMutation = useMutation({
    mutationFn: ({ slug, data }: { slug: string; data: Record<string, unknown> }) =>
      saveChannelProfile(tenantId, productId, slug, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-profiles', tenantId, productId] })
      setEditingSlug(null)
    },
  })

  const publishMutation = useMutation({
    mutationFn: (slug: string) => publishChannel(tenantId, productId, slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-profiles', tenantId, productId] })
      setPublishError(null)
    },
    onError: () => {
      setPublishError('Erro ao publicar no canal.')
    },
  })

  const startEdit = useCallback(
    (profile: ChannelProfile) => {
      setEditingSlug(profile.channel_slug)
      setFormData({
        title: profile.title,
        description: profile.description,
        list_price: profile.list_price ?? '',
        sale_price: profile.sale_price ?? '',
        weight_grams: profile.weight_grams?.toString() ?? '',
      })
    },
    [],
  )

  const handleSave = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!editingSlug) return
      saveMutation.mutate({
        slug: editingSlug,
        data: {
          title: formData.title ?? '',
          description: formData.description ?? '',
          list_price: formData.list_price || null,
          sale_price: formData.sale_price || null,
          weight_grams: formData.weight_grams ? parseInt(formData.weight_grams, 10) : null,
        },
      })
    },
    [editingSlug, formData, saveMutation],
  )

  const handlePublish = useCallback(
    (slug: string) => {
      setPublishError(null)
      publishMutation.mutate(slug)
    },
    [publishMutation],
  )

  const handleAddChannel = useCallback(
    (slug: string) => {
      createMutation.mutate({ channel_slug: slug, title: slug })
    },
    [createMutation],
  )

  const existingSlugs = new Set(profiles.map((p) => p.channel_slug))
  const availableChannels = CHANNELS.filter((ch) => !existingSlugs.has(ch))

  return (
    <div data-testid="product-channels-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Canais</h2>

      {isLoading && (
        <div data-testid="channels-loading" className="text-sm text-neutral-500">
          Carregando perfis de canal...
        </div>
      )}

      {isError && (
        <div data-testid="channels-error" className="text-sm text-red-600">
          Erro ao carregar perfis de canal.
        </div>
      )}

      {!isLoading && !isError && profiles.length === 0 && (
        <div data-testid="channels-empty" className="text-sm text-neutral-500">
          Nenhum perfil de canal configurado. Adicione um canal abaixo.
        </div>
      )}

      {profiles.map((profile) => (
        <div
          key={profile.id}
          data-testid={`channel-row-${profile.channel_slug}`}
          className="border border-border rounded-lg p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm capitalize">{profile.channel_slug}</span>
            <span
              data-testid={`channel-status-${profile.channel_slug}`}
              className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE_COLOR[profile.status] ?? 'bg-neutral-100 text-neutral-600'}`}
            >
              {STATUS_LABEL[profile.status] ?? profile.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={`edit-channel-${profile.channel_slug}`}
              onClick={() => startEdit(profile)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
            >
              Editar
            </button>
            <button
              type="button"
              data-testid={`publish-channel-${profile.channel_slug}`}
              onClick={() => handlePublish(profile.channel_slug)}
              disabled={publishMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
            >
              Publicar
            </button>
          </div>
        </div>
      ))}

      {editingSlug && (
        <form
          data-testid="channel-edit-form"
          onSubmit={handleSave}
          className="border border-primary-200 bg-primary-50 rounded-lg p-4 space-y-3"
        >
          <h3 className="text-sm font-semibold capitalize">
            Editando: {editingSlug}
          </h3>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Titulo</label>
            <input
              data-testid="channel-title-input"
              type="text"
              value={formData.title ?? ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Descricao</label>
            <textarea
              data-testid="channel-description-input"
              value={formData.description ?? ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Preco de lista</label>
              <input
                data-testid="channel-list-price-input"
                type="text"
                value={formData.list_price ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, list_price: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Preco de venda</label>
              <input
                data-testid="channel-sale-price-input"
                type="text"
                value={formData.sale_price ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, sale_price: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Peso (g)</label>
            <input
              data-testid="channel-weight-input"
              type="number"
              value={formData.weight_grams ?? ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, weight_grams: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              data-testid="channel-save-button"
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 cursor-pointer"
            >
              Salvar
            </button>
            <button
              type="button"
              data-testid="channel-cancel-button"
              onClick={() => setEditingSlug(null)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-neutral-50 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {availableChannels.length > 0 && (
        <div data-testid="add-channel-section" className="border-t border-border pt-4 mt-4">
          <h3 className="text-sm font-semibold text-neutral-700 mb-2">Adicionar canal</h3>
          <div className="flex flex-wrap gap-2">
            {availableChannels.map((ch) => (
              <button
                key={ch}
                type="button"
                data-testid={`add-channel-${ch}`}
                onClick={() => handleAddChannel(ch)}
                disabled={createMutation.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-neutral-50 disabled:opacity-50 cursor-pointer capitalize"
              >
                + {ch}
              </button>
            ))}
          </div>
          {createMutation.isError && (
            <p data-testid="channel-create-error" className="text-xs text-red-600 mt-2">
              Erro ao adicionar canal.
            </p>
          )}
        </div>
      )}

      {publishError && (
        <div data-testid="channel-publish-error" className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {publishError}
        </div>
      )}
    </div>
  )
}
