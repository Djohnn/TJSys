import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import TenantSelector from '@/tenant/TenantSelector'
import Navigation from './Navigation'

export default function AppShell(): ReactNode {
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const drawerCloseRef = useRef<HTMLButtonElement>(null)
  const flyoutTriggerRef = useRef<HTMLElement | null>(null)

  const closeMenu = () => {
    setOpenFlyout(null)
    setMenuOpen(false)
    window.setTimeout(() => menuTriggerRef.current?.focus(), 0)
  }

  const closeFlyout = (restoreFocus = true) => {
    setOpenFlyout(null)
    if (restoreFocus) window.setTimeout(() => flyoutTriggerRef.current?.focus(), 0)
  }

  const toggleFlyout = (id: string, trigger: HTMLElement) => {
    flyoutTriggerRef.current = trigger
    setOpenFlyout((prev) => (prev === id ? null : id))
  }

  useEffect(() => {
    if (!menuOpen && !openFlyout) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openFlyout) closeFlyout(true)
      else closeMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, openFlyout])

  useEffect(() => {
    if (!openFlyout) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-flyout-root]')) return
      closeFlyout(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [openFlyout])

  useEffect(() => {
    if (menuOpen) drawerCloseRef.current?.focus()
  }, [menuOpen])

  const trapDrawerFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

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
            <button ref={menuTriggerRef} type="button" aria-label="Abrir menu" aria-controls="mobile-navigation-drawer" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-blue-100 text-[var(--shell-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] lg:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
            <span className="truncate text-sm font-semibold text-neutral-700">Administrativo</span>
          </div>
          <div className="min-w-0 flex-1 sm:flex-none"><TenantSelector /></div>
          <button
            type="button"
            onClick={() => void auth.logout()}
            className="min-h-11 rounded-lg px-3 text-sm text-neutral-700 transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] cursor-pointer"
          >
            Sair
          </button>
        </header>
        <main id="main-content" role="main" className="flex-1 overflow-y-auto bg-surface-muted p-4 sm:p-6 xl:p-8">
          <Outlet />
        </main>
      </div>
      {menuOpen && (
        <div id="mobile-navigation-drawer" data-testid="mobile-navigation-drawer" className="fixed inset-0 z-40 flex lg:hidden">
          <button type="button" tabIndex={-1} aria-hidden="true" onClick={closeMenu} className="absolute inset-0 bg-slate-950/55" />
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Menu principal" onKeyDown={trapDrawerFocus} className="relative z-10 h-full w-[min(336px,calc(100vw-24px))] bg-[var(--shell-ink-soft)] shadow-2xl">
            <button ref={drawerCloseRef} type="button" aria-label="Fechar menu" onClick={closeMenu} className="absolute right-3 top-3 z-20 grid h-11 w-11 place-items-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
            <Navigation
              variant="drawer"
              onNavigate={closeMenu}
              openFlyout={openFlyout}
              onToggleFlyout={toggleFlyout}
              onFlyoutClose={() => closeFlyout()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
