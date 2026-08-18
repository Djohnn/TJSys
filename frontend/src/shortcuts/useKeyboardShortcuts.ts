import { useCallback, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useTenant } from '@/tenant/TenantProvider'
import { getShortcuts, updateShortcuts, type Shortcuts } from './shortcutsApi'
import { DEFAULT_SHORTCUTS, SHORTCUT_ROUTES, type ShortcutConfig } from './shortcuts'

const SHORTCUTS_KEY = 'shortcuts'

export type ShortcutAction = 'global-search' | 'show-help' | string

export interface UseKeyboardShortcutsReturn {
  shortcuts: ShortcutConfig[]
  isLoading: boolean
  updateShortcut: (shortcutId: string, newKeys: string) => void
  getKeysForAction: (action: string) => string
}

export function useKeyboardShortcuts(onAction: (action: ShortcutAction) => void): UseKeyboardShortcutsReturn {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: [SHORTCUTS_KEY, tenantId],
    queryFn: ({ signal }) => getShortcuts(tenantId, signal),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: (shortcuts: Shortcuts) => updateShortcuts(tenantId, shortcuts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SHORTCUTS_KEY, tenantId] })
    },
  })

  const customShortcuts = useMemo(() => query.data ?? {}, [query.data])

  const shortcuts = useMemo(() => {
    return DEFAULT_SHORTCUTS.map((shortcut) => ({
      ...shortcut,
      keys: customShortcuts[shortcut.id] ?? shortcut.keys,
    }))
  }, [customShortcuts])

  const getKeysForAction = useCallback(
    (action: string) => {
      const shortcut = shortcuts.find((s) => s.action === action)
      return shortcut?.keys ?? ''
    },
    [shortcuts],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      const pressedKeys: string[] = []
      if (event.metaKey || event.ctrlKey) pressedKeys.push('Meta')
      if (event.altKey) pressedKeys.push('Alt')
      if (event.shiftKey) pressedKeys.push('Shift')
      if (event.key !== 'Meta' && event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Shift') {
        pressedKeys.push(event.key)
      }

      const pressed = pressedKeys.join('+')

      const matchedShortcut = shortcuts.find((s) => s.keys === pressed)
      if (matchedShortcut) {
        event.preventDefault()
        event.stopPropagation()

        // Handle navigation shortcuts
        const route = SHORTCUT_ROUTES[matchedShortcut.action]
        if (route) {
          navigate(route)
        } else {
          onAction(matchedShortcut.action)
        }
      }
    },
    [shortcuts, onAction, navigate],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const updateShortcut = useCallback(
    (shortcutId: string, newKeys: string) => {
      const updatedShortcuts = { ...customShortcuts, [shortcutId]: newKeys }
      mutation.mutate(updatedShortcuts)
    },
    [customShortcuts, mutation],
  )

  return {
    shortcuts,
    isLoading: query.isLoading,
    updateShortcut,
    getKeysForAction,
  }
}
