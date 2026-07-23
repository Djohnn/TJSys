import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  label: string
  to: string
}

const NAV_ITEMS: NavItem[] = [
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

function isActivePath(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/dashboard') {
    return currentPath === '/dashboard'
  }
  return currentPath.startsWith(itemPath)
}

export default function Navigation(): ReactNode {
  const location = useLocation()

  return (
    <nav data-testid="main-navigation" aria-label="Navegação principal">
      <ul role="list">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              aria-current={isActivePath(location.pathname, item.to) ? 'page' : undefined}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <hr />

      <span id="admin-heading" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
        Administração
      </span>
      <ul role="list" aria-labelledby="admin-heading">
        {ADMIN_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              aria-current={isActivePath(location.pathname, item.to) ? 'page' : undefined}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
