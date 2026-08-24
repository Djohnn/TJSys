import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const AREAS = ['Produtos', 'Serviços', 'Combo', 'Categorias', 'Marcas', 'Unidades de Medida', 'Impressão de Etiquetas']

export default function CatalogHomePage(): ReactNode {
  return (
    <div data-testid="catalog-home-page" className="mx-auto max-w-6xl space-y-6">
      <section data-testid="catalog-overview" className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Visão geral</p>
          <h1 className="mt-2 text-3xl font-black">Catálogo</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100/80">Centralize a identificação, precificação e organização comercial dos itens vendidos pela sua empresa.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/app/catalog/products" className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-sm">Ver produtos</Link>
            <Link to="/app/catalog/products/new" className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm">Novo produto</Link>
            <Link to="/app/catalog/labels" className="rounded-lg border border-white/30 px-4 py-2.5 text-sm font-bold text-white">Imprimir etiquetas</Link>
          </div>
        </div>
        <div className="grid gap-px bg-blue-100 sm:grid-cols-2 xl:grid-cols-4">
          {AREAS.map((area) => <div key={area} className="bg-white px-5 py-4 text-sm font-semibold text-slate-700">{area}</div>)}
        </div>
      </section>
    </div>
  )
}
