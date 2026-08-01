import type { ReactNode } from 'react'

export default function ProductMediaPanel(): ReactNode {
  return (
    <div data-testid="product-media-panel" className="border-2 border-dashed border-neutral-300 rounded-xl p-6 flex flex-col items-center justify-center text-center h-64">
      <svg className="w-10 h-10 text-neutral-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-sm text-neutral-500 font-medium">Upload de Imagens</p>
      <p className="text-xs text-neutral-400 mt-1">Arraste ou clique para adicionar imagens do produto</p>
      <button
        type="button"
        data-testid="media-upload-btn"
        className="mt-4 px-4 py-2 text-xs font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer"
      >
        Selecionar imagens
      </button>
    </div>
  )
}
