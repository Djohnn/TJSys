import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { CATALOG_ITEMS, MODULE_ITEMS, isRouteActive, type NavigationItem } from './navigationModel'

function ModuleIcon({ type }: { type: NavigationItem['icon'] }): ReactNode {
  const paths: Record<NavigationItem['icon'], string> = {
    home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    star: 'm12 3 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.35l-5.4 2.84 1.03-6.02L3.26 9.35l6.04-.88z',
    catalog: 'M4 5.5h16v13H4zM8 5.5v13M16 5.5v13',
    sales: 'M4 7h16l-1.5 13h-13zM8 7a4 4 0 0 1 8 0',
    inventory: 'm4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8',
    purchasing: 'M5 6h16l-2 8H8L5 3H2m7 15a1 1 0 1 0 0 2 1 1 0 0 0 0-2m9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2',
    financial: 'M12 3v18m5-14.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.5-5 3.5 0 5 10 2 10 7 0 2-2 3.5-5 3.5-2.5 0-4-.5-5-1.5',
    reports: 'M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z',
    admin: 'M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 13a7 7 0 0 1 14 0z',
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d={paths[type]} /></svg>
}

function ModuleRail({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }): ReactNode {
  return (
    <div data-testid="module-navigation" className="flex w-[88px] shrink-0 flex-col bg-[var(--shell-ink)] text-white">
      <h1 aria-label="TJSys ERP" className="flex h-[78px] flex-col items-center justify-center border-b border-white/10">
        <span className="text-lg font-black tracking-tight">TJSys </span>
        <span className="text-[9px] font-semibold tracking-[0.28em] text-cyan-300">ERP</span>
      </h1>
      <div className="shell-scrollbar flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {MODULE_ITEMS.map((item) => {
          const active = item.id === 'catalog'
            ? pathname.startsWith('/catalog')
            : item.id === 'favorites'
              ? false
              : isRouteActive(pathname, item.to)
          return (
            <Link key={item.id} to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={`group flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-colors ${active ? 'bg-[var(--shell-active)] text-white ring-1 ring-white/25' : 'text-blue-100/75 hover:bg-white/10 hover:text-white'}`}>
              <ModuleIcon type={item.icon} />
              <span className="text-[10px] font-semibold leading-tight">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function CatalogContext({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }): ReactNode {
  if (!pathname.startsWith('/catalog')) return null
  return (
    <div data-testid="catalog-context-navigation" className="w-[248px] shrink-0 border-r border-blue-950/20 bg-[var(--shell-ink-soft)] text-white">
      <div className="border-b border-white/10 px-6 py-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Módulo</p>
        <h2 className="mt-1 text-xl font-black">Catálogo</h2>
        <p className="mt-1 text-xs leading-relaxed text-blue-100/65">Produtos, serviços e estrutura comercial.</p>
      </div>
      <div className="space-y-1 p-3">
        {CATALOG_ITEMS.map((item) => {
          const active = isRouteActive(pathname, item.to)
          return (
            <Link key={item.id} to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-11 items-center rounded-lg px-4 text-sm font-bold transition-colors ${active ? 'bg-white text-[var(--shell-ink)] shadow-sm before:absolute before:left-0 before:h-5 before:w-1 before:rounded-r before:bg-[var(--shell-active)]' : 'text-blue-50/80 hover:bg-white/10 hover:text-white'}`}>
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

interface NavigationProps {
  variant?: 'desktop' | 'drawer'
  onNavigate?: () => void
}

export default function Navigation({ variant = 'desktop', onNavigate }: NavigationProps): ReactNode {
  const { pathname } = useLocation()
  const className = variant === 'desktop'
    ? 'hidden min-h-screen shrink-0 lg:flex'
    : 'flex h-full min-h-0 w-full shrink-0'
  return <nav data-testid={variant === 'desktop' ? 'main-navigation' : undefined} aria-label={variant === 'desktop' ? 'Navegação principal' : 'Navegação móvel'} className={className}><ModuleRail pathname={pathname} onNavigate={onNavigate} /><CatalogContext pathname={pathname} onNavigate={onNavigate} /></nav>
}
