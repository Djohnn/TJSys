import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'

interface HubCard {
  title: string
  description: string
  to: string
  icon: ReactNode
}

const BoxIcon = () => (
  <svg className="w-8 h-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
)

const WrenchIcon = () => (
  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-6.21 6.21a1.5 1.5 0 01-2.12 0l-1.41-1.41a1.5 1.5 0 010-2.12l6.21-6.21m0 0a4.5 4.5 0 116.36-6.36l-3.18 3.18-.88-.88.88.88-1.06 1.06.88.88-.88.88-3.18-3.18a4.48 4.48 0 00-1.18 1.24m0 0a4.49 4.49 0 001.18 1.24" />
  </svg>
)

const PuzzleIcon = () => (
  <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
  </svg>
)

const TagIcon = () => (
  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
)

const RulerIcon = () => (
  <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

const CubeIcon = () => (
  <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-8 h-8 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
)

const HUBS: HubCard[] = [
  { title: 'Produtos', description: 'Gerencie produtos, variações e preços', to: '/catalog/products', icon: <BoxIcon /> },
  { title: 'Serviços', description: 'Cadastre e precifique serviços prestados', to: '/catalog/services', icon: <WrenchIcon /> },
  { title: 'Combo', description: 'Monte kits e combos de produtos', to: '/catalog/products?product_kind=kit', icon: <PuzzleIcon /> },
  { title: 'Categorias', description: 'Organize produtos por categorias', to: '/catalog/categories', icon: <FolderIcon /> },
  { title: 'Marcas', description: 'Cadastre marcas dos produtos', to: '/catalog/brands', icon: <TagIcon /> },
  { title: 'Unidades', description: 'Gerencie unidades de medida', to: '/catalog/units', icon: <RulerIcon /> },
  { title: 'Etiquetas', description: 'Configure modelos de etiquetas', to: '/catalog/tags', icon: <CubeIcon /> },
]

export default function CatalogHomePage(): ReactNode {
  return (
    <div data-testid="catalog-home-page" className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Catálogo</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {HUBS.map((hub) => (
          <Link
            key={hub.to}
            to={hub.to}
            data-testid={`hub-card-${hub.title.toLowerCase().replace(/\s+/g, '-')}`}
            className="block"
          >
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex flex-col items-start gap-3">
                {hub.icon}
                <div>
                  <h3 className="font-semibold text-neutral-900">{hub.title}</h3>
                  <p className="text-sm text-neutral-500 mt-1">{hub.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
