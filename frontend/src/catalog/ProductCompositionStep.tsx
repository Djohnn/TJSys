import type { ReactNode } from 'react'

export default function ProductCompositionStep(): ReactNode {
  return (
    <div data-testid="product-composition-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Composição</h2>
      <div className="p-6 border-2 border-dashed border-neutral-300 rounded-xl flex items-center justify-center text-center">
        <p className="text-sm text-neutral-500">Composição será implementada na Sprint 23</p>
      </div>
    </div>
  )
}
