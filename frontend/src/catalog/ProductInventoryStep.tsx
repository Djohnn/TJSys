import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ProductInventoryStepProps {
  productId: string
}

export default function ProductInventoryStep({ productId }: ProductInventoryStepProps): ReactNode {
  return (
    <div data-testid="product-inventory-step" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900 mb-6">Estoque</h2>

      <div className="p-4 border border-border rounded-lg bg-neutral-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-500">Saldo em Estoque</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1" data-testid="stock-balance-value">--</p>
          </div>
          <Link
            to={`/inventory/balances?product=${productId}`}
            className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-lg hover:bg-primary-50 cursor-pointer inline-flex items-center"
            data-testid="inventory-balance-link"
          >
            Ver no Estoque
          </Link>
        </div>
      </div>

      <p className="text-sm text-neutral-500">
        O saldo de estoque é gerenciado pelo módulo de Inventário e não pode ser alterado nesta tela.
      </p>
    </div>
  )
}
