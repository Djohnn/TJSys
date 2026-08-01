import { useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchProductImages, uploadProductImage } from './catalogApi'

interface ProductMediaPanelProps {
  productId?: string | null
}

export default function ProductMediaPanel({ productId }: ProductMediaPanelProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data: images = [] } = useQuery({
    queryKey: ['product-images', tenantId, productId],
    queryFn: () => fetchProductImages(tenantId, productId!),
    enabled: !!tenantId && !!productId,
  })
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(tenantId, productId!, file),
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['product-images', tenantId, productId],
    }),
    onError: () => setError('Não foi possível enviar a imagem.'),
  })

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    setError(null)
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Use uma imagem JPEG, PNG ou WebP.')
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('A imagem deve ter no máximo 5 MB.')
        continue
      }
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }

  return (
    <div data-testid="product-media-panel" className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center min-h-64">
      {images.length > 0 && (
        <div data-testid="product-image-gallery" className="grid grid-cols-2 gap-2 mb-4">
          {images.map((image) => (
            <img key={image.id} src={image.file ?? image.object_key} alt={image.alt_text} className="w-full h-24 object-cover rounded-lg" />
          ))}
        </div>
      )}
      <svg className="w-10 h-10 text-neutral-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-sm text-neutral-500 font-medium">Upload de Imagens</p>
      <p className="text-xs text-neutral-400 mt-1">Arraste ou clique para adicionar imagens do produto</p>
      <button
        type="button"
        data-testid="media-upload-btn"
        onClick={() => inputRef.current?.click()}
        disabled={!productId || uploadMutation.isPending}
        className="mt-4 px-4 py-2 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer disabled:opacity-50"
      >
        {uploadMutation.isPending ? 'Enviando...' : 'Selecionar imagens'}
      </button>
      <input ref={inputRef} data-testid="media-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFiles} />
      {!productId && <p className="text-xs text-neutral-500 mt-2">Salve a identificação antes de adicionar imagens.</p>}
      {error && <p data-testid="media-upload-error" className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
