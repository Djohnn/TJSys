import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem { label: string; to: string }

const MAIN_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Catálogo', to: '/catalog' },
  { label: 'Compras', to: '/purchasing/orders' },
  { label: 'Estoque', to: '/inventory' },
  { label: 'Vendas', to: '/sales' },
  { label: 'Pessoas', to: '/people' },
  { label: 'Financeiro', to: '/financial' },
  { label: 'Fiscal', to: '/fiscal/documents' },
  { label: 'Pagamentos', to: '/payments/transactions' },
  { label: 'Monitoramento', to: '/monitoring/operations' },
]

const ADMIN_ITEMS: NavItem[] = [
  { label: 'Empresas', to: '/organization/companies' },
  { label: 'Filiais', to: '/organization/branches' },
  { label: 'Fornecedores', to: '/purchasing/suppliers' },
  { label: 'Membros', to: '/access/members' },
  { label: 'Convites', to: '/access/invitations' },
  { label: 'Segurança', to: '/security/mfa' },
  { label: 'Dispositivos', to: '/devices' },
]

function isActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/dashboard') return currentPath === '/dashboard'
  return currentPath.startsWith(itemPath)
}

function NavSection({ items, currentPath, label }: { items: NavItem[]; currentPath: string; label?: string }): ReactNode {
  return (
    <div className="mb-4">
      {label && <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</p>}
      {items.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={`block px-4 py-2 mx-2 rounded-lg text-sm font-medium transition-colors ${
            isActive(currentPath, item.to)
              ? 'bg-primary-50 text-primary-700'
              : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
          }`}
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  )
}

export default function Navigation(): ReactNode {
  const { pathname } = useLocation()

  return (
    <nav data-testid="main-navigation" className="w-60 min-h-screen bg-neutral-800 text-white flex flex-col py-4">
      <div className="px-4 mb-6">
        <h1 className="text-lg font-bold text-white">Zyrp ERP</h1>
        <p className="text-xs text-neutral-400">Administrativo</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavSection items={MAIN_ITEMS} currentPath={pathname} />
        <NavSection items={ADMIN_ITEMS} currentPath={pathname} label="Administração" />
      </div>
    </nav>
  )
}
