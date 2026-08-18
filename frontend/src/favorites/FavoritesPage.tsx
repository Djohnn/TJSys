import { Link } from 'react-router-dom'

import { useFavorites } from '@/favorites/useFavorites'
import EmptyState from '@/components/EmptyState'

export default function FavoritesPage(): React.ReactNode {
  const { favorites, removeFavorite, isLoading } = useFavorites()

  if (isLoading) {
    return (
      <div data-testid="favorites-page" className="p-6">
        <h2 className="text-2xl font-bold text-neutral-900 mb-4">Favoritos</h2>
        <p className="text-sm text-[var(--color-text-muted)]">Carregando...</p>
      </div>
    )
  }

  return (
    <div data-testid="favorites-page" className="p-6">
      <h2 className="text-2xl font-bold text-neutral-900 mb-4">Favoritos</h2>

      {favorites.length === 0 ? (
        <EmptyState
          title="Nenhum favorito"
          description="Adicione itens aos favoritos para acesso rápido."
          action={
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary-800)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-900)]"
            >
              Explorar catálogo
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {favorites.map((favorite) => (
            <div
              key={favorite.id}
              className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-gray-100)]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-5 w-5 text-yellow-500"
                >
                  <path d="m12 3 2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.35l-5.4 2.84 1.03-6.02L3.26 9.35l6.04-.88z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={favorite.route}
                  className="text-sm font-semibold text-[var(--color-gray-900)] hover:underline"
                >
                  {favorite.label}
                </Link>
                <p className="text-xs text-[var(--color-gray-500)]">{favorite.entity_type}</p>
              </div>
              <button
                type="button"
                aria-label={`Remover ${favorite.label} dos favoritos`}
                onClick={() => removeFavorite(favorite.id)}
                className="shrink-0 rounded-[var(--radius-md)] p-2 text-[var(--color-gray-400)] transition-colors hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-600)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-4 w-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
