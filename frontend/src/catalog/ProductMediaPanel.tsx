import { useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { fetchProductImages, uploadProductImage } from './catalogApi'
import type { ProductImage } from './catalogApi'

interface ProductMediaPanelProps {
  productId?: string | null
}

interface PreviewImage {
  id: string
  url: string
  alt_text: string
  is_primary: boolean
  position: number
}

export default function ProductMediaPanel({ productId }: ProductMediaPanelProps): ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [previews, setPreviews] = useState<PreviewImage[]>([])
  const queryClient = useQueryClient()
  const { data: images = [], isError: mediaLoadFailed } = useQuery({
    queryKey: ['product-images', tenantId, productId],
    queryFn: () => fetchProductImages(tenantId, productId!),
    enabled: !!tenantId && !!productId,
  })
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(tenantId, productId!, file),
    onSuccess: (uploaded: ProductImage) => {
      // Remove the local preview and show the persisted image URL
      setPreviews((prev) => prev.filter((p) => p.id !== uploaded.alt_text))
      queryClient.invalidateQueries({
        queryKey: ['product-images', tenantId, productId],
      })
    },
    onError: (_err, file) => {
      const altText = file.name.replace(/\.[^.]+$/, '')
      setPreviews((prev) => prev.filter((p) => p.id !== altText))
      setError('Não foi possível enviar a imagem.')
    },
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
      // Show a local preview immediately while the upload is in progress
      const altText = file.name.replace(/\.[^.]+$/, '')
      const preview: PreviewImage = {
        id: altText,
        url: URL.createObjectURL(file),
        alt_text: altText,
        is_primary: false,
        position: 0,
      }
      setPreviews((prev) => [...prev, preview])
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }

  const displayImages: PreviewImage[] = [
    ...previews,
    ...images
      .filter((image) => !previews.some((p) => p.alt_text === image.alt_text))
      .map((image) => ({
        id: image.id,
        url: image.file_url ?? image.file ?? '',
        alt_text: image.alt_text,
        is_primary: image.is_primary,
        position: image.position,
      })),
  ]

  return (
    <div data-testid="product-media-panel" className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center min-h-64">
      {displayImages.length > 0 && (
        <div data-testid="product-image-gallery" className="grid grid-cols-2 gap-2 mb-4">
          {displayImages.map((image) => (
            <img
              key={image.id}
              src={image.url}
              alt={image.alt_text}
              className="w-full h-24 object-cover rounded-lg"
            />
          ))}
        </div>
      )}
      {mediaLoadFailed && (
        <p data-testid="media-load-error" role="alert" className="text-xs text-red-600 mt-2">
          Não foi possível carregar as imagens. O restante do cadastro permanece disponível.
        </p>
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
