import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import TenantSelector from '@/tenant/TenantSelector'
import Navigation from './Navigation'

export default function AppShell(): ReactNode {
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const flyoutTriggerRef = useRef<HTMLElement | null>(null)

  const closeMenu = () => {
    setMenuOpen(false)
    window.setTimeout(() => menuTriggerRef.current?.focus(), 0)
  }

  const closeFlyout = () => {
    setOpenFlyout(null)
    window.setTimeout(() => flyoutTriggerRef.current?.focus(), 0)
  }

  const toggleFlyout = (id: string, trigger: HTMLElement) => {
    flyoutTriggerRef.current = trigger
    setOpenFlyout((prev) => (prev === id ? null : id))
  }

  useEffect(() => {
    if (!menuOpen && !openFlyout) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openFlyout) closeFlyout()
      else closeMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, openFlyout])

  return (
    <div data-testid="app-shell" className="flex min-h-screen overflow-x-hidden">
      <Navigation
        openFlyout={openFlyout}
        onToggleFlyout={toggleFlyout}
        onFlyoutClose={closeFlyout}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header role="banner" className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6">
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:border focus:rounded">
            Pular para conteúdo
          </a>
          <div className="flex min-w-0 items-center gap-3">
            <button ref={menuTriggerRef} type="button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-100 text-[var(--shell-ink)] lg:hidden">
              <span aria-hidden="true" className="text-xl leading-none">☰</span>
            </button>
            <span className="truncate text-sm font-semibold text-neutral-700">Administrativo</span>
          </div>
          <div className="min-w-0 flex-1 sm:flex-none"><TenantSelector /></div>
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors cursor-pointer"
          >
            Sair
          </button>
        </header>
        <main id="main-content" role="main" className="flex-1 overflow-y-auto bg-surface-muted p-4 sm:p-6 xl:p-8">
          <Outlet />
        </main>
      </div>
      {menuOpen && (
        <div data-testid="mobile-navigation-drawer" className="fixed inset-0 z-40 flex lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={closeMenu} className="absolute inset-0 bg-slate-950/55" />
          <div role="dialog" aria-modal="true" aria-label="Menu principal" className="relative z-10 h-full w-[min(336px,calc(100vw-24px))] shadow-2xl">
            <Navigation variant="drawer" onNavigate={closeMenu} />
          </div>
        </div>
      )}
    </div>
  )
}
