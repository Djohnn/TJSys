import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import { search, type SearchResult } from './searchApi'

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps): React.ReactNode {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['search', tenantId, query],
    queryFn: ({ signal }) => search(tenantId, query, 10, signal),
    enabled: Boolean(tenantId) && query.length >= 2,
    staleTime: 5_000,
  })

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const handleSelect = useCallback(
    (result: SearchResult) => {
      navigate(result.route)
      onClose()
    },
    [navigate, onClose],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (event.key === 'Enter' && results[selectedIndex]) {
        handleSelect(results[selectedIndex])
      }
    },
    [onClose, results, selectedIndex, handleSelect],
  )

  if (!open) return null

  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, result) => {
    const group = result.type
    if (!acc[group]) acc[group] = []
    acc[group].push(result)
    return acc
  }, {})

  const groupLabels: Record<string, string> = {
    product: 'Produtos',
    category: 'Categorias',
    brand: 'Marcas',
    person: 'Pessoas',
    supplier: 'Fornecedores',
  }

  return (
    <div
      data-testid="global-search-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className="w-full max-w-lg rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-[var(--color-gray-500)]">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar produtos, categorias, pessoas..."
            aria-label="Buscar"
            className="min-h-12 flex-1 bg-transparent py-3 text-[var(--color-text)] placeholder:text-[var(--color-gray-400)] focus:outline-none"
          />
          <kbd className="hidden rounded bg-[var(--color-gray-100)] px-2 py-0.5 text-xs text-[var(--color-gray-600)] sm:inline">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {query.length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-gray-500)]">
              Digite pelo menos 2 caracteres para buscar
            </p>
          )}

          {query.length >= 2 && isLoading && (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-gray-500)]">
              Buscando...
            </p>
          )}

          {query.length >= 2 && !isLoading && results.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-gray-500)]">
              Nenhum resultado encontrado para &quot;{query}&quot;
            </p>
          )}

          {Object.entries(groupedResults).map(([group, groupResults]) => (
            <div key={group} className="mb-2">
              <h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
                {groupLabels[group] ?? group}
              </h3>
              {groupResults.map((result) => {
                const globalIndex = results.indexOf(result)
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    role="option"
                    aria-selected={globalIndex === selectedIndex}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left transition-colors ${
                      globalIndex === selectedIndex
                        ? 'bg-[var(--color-primary-100)]'
                        : 'hover:bg-[var(--color-gray-100)]'
                    }`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--color-gray-100)]">
                      <span className="text-xs font-medium text-[var(--color-gray-600)]">
                        {result.type.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-gray-900)]">
                        {result.label}
                      </p>
                      <p className="truncate text-xs text-[var(--color-gray-500)]">
                        {result.subtitle}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-gray-500)]">
          <span>↑↓ navegar · Enter selecionar</span>
          <span>ESC fechar</span>
        </div>
      </div>
    </div>
  )
}
