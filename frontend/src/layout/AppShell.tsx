import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import TenantSelector from '@/tenant/TenantSelector'
import { GlobalSearch } from '@/search/GlobalSearch'
import { ShortcutHelp } from '@/shortcuts/ShortcutHelp'
import { useKeyboardShortcuts } from '@/shortcuts/useKeyboardShortcuts'
import Navigation from './Navigation'

export default function AppShell(): ReactNode {
  const auth = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFlyout, setOpenFlyout] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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

  const handleShortcutAction = useCallback((action: string) => {
    if (action === 'global-search') {
      setSearchOpen(true)
    } else if (action === 'show-help') {
      setHelpOpen((prev) => !prev)
    }
  }, [])

  useKeyboardShortcuts(handleShortcutAction)

  useEffect(() => {
    if (!menuOpen && !openFlyout && !searchOpen && !helpOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (searchOpen) setSearchOpen(false)
      else if (helpOpen) setHelpOpen(false)
      else if (openFlyout) closeFlyout(true)
      else closeMenu()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen, openFlyout, searchOpen, helpOpen])

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar (Ctrl+K)"
              className="flex h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] px-3 text-sm text-[var(--color-gray-600)] transition-colors hover:bg-[var(--color-gray-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)]"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <span className="hidden sm:inline">Buscar...</span>
              <kbd className="hidden rounded bg-[var(--color-gray-200)] px-1.5 py-0.5 text-xs text-[var(--color-gray-700)] sm:inline">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Atalhos de teclado"
              className="hidden h-11 w-11 items-center justify-center rounded-lg text-[var(--color-gray-600)] transition-colors hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)] sm:flex"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
            </button>
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
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
