import { Link, useLocation } from 'react-router-dom'

import { useFavorites } from './useFavorites'
import { normalizeAdminRoute } from '@/app/adminRoutes'

interface FavoritesRailProps {
  onNavigate?: () => void
}

export function FavoritesRail({ onNavigate }: FavoritesRailProps): React.ReactNode {
  const { favorites, removeFavorite } = useFavorites()
  const { pathname } = useLocation()

  if (favorites.length === 0) {
    return null
  }

  return (
    <div className="border-b border-white/10 px-2 py-2">
      <h2 className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
        Favoritos
      </h2>
      <div className="space-y-1">
        {favorites.map((favorite) => {
          const route = normalizeAdminRoute(favorite.route)
          const isActive = pathname === route || pathname.startsWith(`${route}/`)
          return (
            <div key={favorite.id} className="group relative">
              <Link
                to={route}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-[var(--shell-active)] text-white ring-1 ring-white/25'
                    : 'text-blue-100/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0 text-yellow-400"
                >
                  <path d="m12 3 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.35l-5.4 2.84 1.03-6.02L3.26 9.35l6.04-.88z" />
                </svg>
                <span className="truncate">{favorite.label}</span>
              </Link>
              <button
                type="button"
                aria-label={`Remover ${favorite.label} dos favoritos`}
                onClick={(event) => {
                  event.preventDefault()
                  removeFavorite(favorite.id)
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-white/50 hover:bg-white/20 hover:text-white"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-3 w-3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FavoritesRail
