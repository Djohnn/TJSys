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
  { id: 'home', label: 'Início', route: '/app/dashboard', status: 'active', icon: 'home' },
  { id: 'favorites', label: 'Favoritos', route: '/app/favorites', status: 'active', icon: 'star' },
  { id: 'catalog', label: 'Catálogo', route: '/app/catalog', status: 'active', icon: 'catalog' },
  {
    id: 'sales',
    label: 'Vendas',
    status: 'active',
    icon: 'sales',
    children: [
      { id: 'sales-orders', label: 'Pedidos de Venda', route: '/app/sales', status: 'active' },
      { id: 'sales-services', label: 'Serviços', route: '/app/catalog/services', status: 'planned' },
      { id: 'sales-quotes', label: 'Orçamentos', route: '/app/sales/quotes', status: 'planned' },
      { id: 'sales-returns', label: 'Devoluções', route: '/app/sales/returns', status: 'planned' },
    ],
  },
  { id: 'inventory', label: 'Estoque', route: '/app/inventory', status: 'active', icon: 'inventory' },
  { id: 'purchasing', label: 'Compras', route: '/app/purchasing/orders', status: 'active', icon: 'purchasing' },
  { id: 'financial', label: 'Financeiro', route: '/app/financial', status: 'active', icon: 'financial' },
  { id: 'reports', label: 'Relatórios', route: '/app/monitoring/operations', status: 'active', icon: 'reports' },
  {
    id: 'admin',
    label: 'Administração',
    status: 'active',
    icon: 'admin',
    children: [
      { id: 'admin-companies', label: 'Empresas', route: '/app/organization/companies', status: 'active' },
      { id: 'admin-branches', label: 'Filiais', route: '/app/organization/branches', status: 'active' },
      { id: 'admin-members', label: 'Membros', route: '/app/access/members', status: 'active' },
      { id: 'admin-invitations', label: 'Convites', route: '/app/access/invitations', status: 'active' },
      { id: 'admin-security', label: 'Segurança', route: '/app/security/mfa', status: 'active' },
      { id: 'admin-devices', label: 'Dispositivos', route: '/app/devices', status: 'active' },
    ],
  },
]

export const CATALOG_ITEMS: readonly ContextNavigationItem[] = [
  { id: 'products', label: 'Produtos', to: '/app/catalog/products' },
  { id: 'services', label: 'Serviços', to: '/app/catalog/services' },
  { id: 'combos', label: 'Combo', to: '/app/catalog/combos' },
  { id: 'categories', label: 'Categorias', to: '/app/catalog/categories' },
  { id: 'brands', label: 'Marcas', to: '/app/catalog/brands' },
  { id: 'units', label: 'Unidades de Medida', to: '/app/catalog/units' },
  { id: 'labels', label: 'Impressão de Etiquetas', to: '/app/catalog/labels' },
]

export function isRouteActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/app/dashboard') return currentPath === '/app/dashboard'
  if (itemPath === '/app/catalog') return currentPath === '/app/catalog'
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`)
}

export function canNavigate(item: NavigationItem): boolean {
  return item.status === 'active' && Boolean(item.route)
}
