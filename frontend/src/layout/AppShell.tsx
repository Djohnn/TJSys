import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from './Navigation'

export default function AppShell(): ReactNode {
  return (
    <div data-testid="app-shell" className="flex min-h-screen">
      <Navigation />
      <div className="flex-1 flex flex-col">
        <header role="banner" className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:border focus:rounded">
            Pular para conteúdo
          </a>
          <span className="text-sm font-semibold text-neutral-700">Administrativo</span>
          <button type="button" className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors cursor-pointer">
            Sair
          </button>
        </header>
        <main id="main-content" role="main" className="flex-1 p-8 bg-surface-muted overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
