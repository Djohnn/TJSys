export interface ShortcutConfig {
  id: string
  label: string
  keys: string
  action: string
  category: 'navigation' | 'search' | 'help'
}

export const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: 'global-search', label: 'Busca global', keys: 'Meta+k', action: 'global-search', category: 'search' },
  { id: 'show-help', label: 'Ajuda de atalhos', keys: 'Meta+/', action: 'show-help', category: 'help' },
  { id: 'navigate-home', label: 'Início', keys: 'Meta+1', action: 'navigate-home', category: 'navigation' },
  { id: 'navigate-favorites', label: 'Favoritos', keys: 'Meta+2', action: 'navigate-favorites', category: 'navigation' },
  { id: 'navigate-catalog', label: 'Catálogo', keys: 'Meta+3', action: 'navigate-catalog', category: 'navigation' },
  { id: 'navigate-sales', label: 'Vendas', keys: 'Meta+4', action: 'navigate-sales', category: 'navigation' },
  { id: 'navigate-inventory', label: 'Estoque', keys: 'Meta+5', action: 'navigate-inventory', category: 'navigation' },
  { id: 'navigate-purchasing', label: 'Compras', keys: 'Meta+6', action: 'navigate-purchasing', category: 'navigation' },
  { id: 'navigate-financial', label: 'Financeiro', keys: 'Meta+7', action: 'navigate-financial', category: 'navigation' },
  { id: 'navigate-reports', label: 'Relatórios', keys: 'Meta+8', action: 'navigate-reports', category: 'navigation' },
  { id: 'navigate-admin', label: 'Administração', keys: 'Meta+9', action: 'navigate-admin', category: 'navigation' },
]

export const SHORTCUT_ROUTES: Record<string, string> = {
  'navigate-home': '/dashboard',
  'navigate-favorites': '/favorites',
  'navigate-catalog': '/catalog',
  'navigate-sales': '/sales',
  'navigate-inventory': '/inventory',
  'navigate-purchasing': '/purchasing/orders',
  'navigate-financial': '/financial',
  'navigate-reports': '/monitoring/operations',
  'navigate-admin': '/organization/companies',
}

export function formatShortcutKeys(keys: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  return keys
    .replace('Meta', isMac ? '⌘' : 'Ctrl')
    .replace('Control', isMac ? '⌘' : 'Ctrl')
    .replace('Alt', isMac ? '⌥' : 'Alt')
    .replace('Shift', isMac ? '⇧' : 'Shift')
    .replace('+', isMac ? '' : '+')
}
