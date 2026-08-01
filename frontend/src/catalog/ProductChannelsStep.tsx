import type { ReactNode } from 'react'

export default function ProductChannelsStep(): ReactNode {
  return (
    <div data-testid="product-channels-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Canais</h2>
      <div className="p-6 border-2 border-dashed border-neutral-300 rounded-xl flex items-center justify-center text-center">
        <p className="text-sm text-neutral-500">Publicação em canais será disponível na Sprint 29</p>
      </div>
    </div>
  )
}
