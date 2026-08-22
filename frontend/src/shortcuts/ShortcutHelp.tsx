import { useCallback, useEffect, useRef } from 'react'

import { formatShortcutKeys } from './shortcuts'
import { useKeyboardShortcuts, type ShortcutAction } from './useKeyboardShortcuts'

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

export function ShortcutHelp({ open, onClose }: ShortcutHelpProps): React.ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleAction = useCallback(
    (action: ShortcutAction) => {
      if (action === 'show-help') {
        onClose()
      }
    },
    [onClose],
  )

  const { shortcuts } = useKeyboardShortcuts(handleAction)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const groupedShortcuts = shortcuts.reduce<Record<string, typeof shortcuts>>((acc, shortcut) => {
    if (!acc[shortcut.category]) acc[shortcut.category] = []
    acc[shortcut.category].push(shortcut)
    return acc
  }, {})

  const categoryLabels: Record<string, string> = {
    navigation: 'Navegação',
    search: 'Busca',
    help: 'Ajuda',
  }

  return (
    <div
      data-testid="shortcut-help-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Atalhos de teclado"
        className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--color-gray-900)]">Atalhos de Teclado</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-[var(--radius-md)] text-xl leading-none text-[var(--color-gray-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-800)]"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-6">
          {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
            <div key={category} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--color-gray-900)]">
                {categoryLabels[category] ?? category}
              </h3>
              <div className="space-y-2">
                {categoryShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2"
                  >
                    <span className="text-sm text-[var(--color-gray-700)]">{shortcut.label}</span>
                    <kbd className="rounded bg-[var(--color-gray-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-600)]">
                      {formatShortcutKeys(shortcut.keys)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--color-border)] px-6 py-4 text-center text-xs text-[var(--color-gray-500)]">
          Pressione <kbd className="rounded bg-[var(--color-gray-100)] px-1.5 py-0.5">ESC</kbd> para fechar
        </div>
      </div>
    </div>
  )
}
