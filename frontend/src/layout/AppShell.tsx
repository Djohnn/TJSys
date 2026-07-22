import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'

import { useAuth } from '@/auth/AuthProvider'
import { useTenant } from '@/tenant/TenantProvider'
import TenantSelector from '@/tenant/TenantSelector'
import AppErrorBoundary from '@/errors/AppErrorBoundary'
import Navigation from './Navigation'

export default function AppShell(): ReactNode {
  const auth = useAuth()
  useTenant()

  return (
    <div data-testid="app-shell">
      <a
        href="#main-content"
        className="skip-link"
      >
        Pular para conteúdo
      </a>

      <header role="banner">
        <h1>Zyrp ERP</h1>
        <TenantSelector />
        <div className="user-info">
          {auth.user && <span>{auth.user.email}</span>}
          <button onClick={auth.logout} type="button">
            Sair
          </button>
        </div>
      </header>

      <Navigation />

      <main id="main-content" role="main">
        <AppErrorBoundary>
          <Outlet />
        </AppErrorBoundary>
      </main>
    </div>
  )
}
