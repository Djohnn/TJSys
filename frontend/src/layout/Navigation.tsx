import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  label: string
  to: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Catálogo', to: '/catalog' },
  { label: 'Estoque', to: '/inventory' },
  { label: 'Vendas', to: '/sales' },
  { label: 'Financeiro', to: '/financial' },
  { label: 'Pessoas', to: '/people' },
  { label: 'Configurações', to: '/settings' },
]

export default function Navigation(): ReactNode {
  const location = useLocation()

  return (
    <nav data-testid="main-navigation" aria-label="Navegação principal">
      <ul role="list">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to)

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
