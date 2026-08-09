export type NavigationIcon =
  | 'home'
  | 'star'
  | 'catalog'
  | 'sales'
  | 'inventory'
  | 'purchasing'
  | 'financial'
  | 'reports'
  | 'admin'

export type NavigationItem = {
  id: string
  label: string
  route?: string
  status: 'active' | 'planned'
  children?: NavigationItem[]
  icon?: NavigationIcon
}

export interface ContextNavigationItem { id: string; label: string; to: string }

export const MODULE_ITEMS: readonly NavigationItem[] = [
  { id: 'home', label: 'Início', route: '/dashboard', status: 'active', icon: 'home' },
  { id: 'favorites', label: 'Favoritos', route: '/catalog', status: 'active', icon: 'star' },
  { id: 'catalog', label: 'Catálogo', route: '/catalog', status: 'active', icon: 'catalog' },
  {
    id: 'sales',
    label: 'Vendas',
    status: 'active',
    icon: 'sales',
    children: [
      { id: 'sales-orders', label: 'Pedidos de Venda', route: '/sales/orders', status: 'active' },
      { id: 'sales-services', label: 'Serviços', route: '/catalog/services', status: 'planned' },
      { id: 'sales-quotes', label: 'Orçamentos', route: '/sales/quotes', status: 'planned' },
      { id: 'sales-returns', label: 'Devoluções', route: '/sales/returns', status: 'planned' },
    ],
  },
  { id: 'inventory', label: 'Estoque', route: '/inventory', status: 'active', icon: 'inventory' },
  { id: 'purchasing', label: 'Compras', route: '/purchasing/orders', status: 'active', icon: 'purchasing' },
  { id: 'financial', label: 'Financeiro', route: '/financial', status: 'active', icon: 'financial' },
  { id: 'reports', label: 'Relatórios', route: '/monitoring/operations', status: 'active', icon: 'reports' },
  { id: 'admin', label: 'Administração', route: '/organization/companies', status: 'active', icon: 'admin' },
]

export const CATALOG_ITEMS: readonly ContextNavigationItem[] = [
  { id: 'products', label: 'Produtos', to: '/catalog/products' },
  { id: 'services', label: 'Serviços', to: '/catalog/services' },
  { id: 'combos', label: 'Combo', to: '/catalog/combos' },
  { id: 'categories', label: 'Categorias', to: '/catalog/categories' },
  { id: 'brands', label: 'Marcas', to: '/catalog/brands' },
  { id: 'units', label: 'Unidades de Medida', to: '/catalog/units' },
  { id: 'labels', label: 'Impressão de Etiquetas', to: '/catalog/labels' },
]

export function isRouteActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/dashboard') return currentPath === '/dashboard'
  if (itemPath === '/catalog') return currentPath === '/catalog'
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

export function canNavigate(item: NavigationItem): boolean {
  return item.status === 'active' && Boolean(item.route)
}