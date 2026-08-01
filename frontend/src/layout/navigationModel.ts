export interface NavigationItem {
  id: string
  label: string
  to: string
  icon: 'home' | 'star' | 'catalog' | 'sales' | 'inventory' | 'purchasing' | 'financial' | 'reports' | 'admin'
}

export interface ContextNavigationItem { id: string; label: string; to: string }

export const MODULE_ITEMS: readonly NavigationItem[] = [
  { id: 'home', label: 'Início', to: '/dashboard', icon: 'home' },
  { id: 'favorites', label: 'Favoritos', to: '/catalog', icon: 'star' },
  { id: 'catalog', label: 'Catálogo', to: '/catalog', icon: 'catalog' },
  { id: 'sales', label: 'Vendas', to: '/sales', icon: 'sales' },
  { id: 'inventory', label: 'Estoque', to: '/inventory', icon: 'inventory' },
  { id: 'purchasing', label: 'Compras', to: '/purchasing/orders', icon: 'purchasing' },
  { id: 'financial', label: 'Financeiro', to: '/financial', icon: 'financial' },
  { id: 'reports', label: 'Relatórios', to: '/monitoring/operations', icon: 'reports' },
  { id: 'admin', label: 'Administração', to: '/organization/companies', icon: 'admin' },
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
