import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useTenant } from '@/tenant/TenantProvider'
import {
  type UserFavorite,
  type CreateFavoriteInput,
  getFavorites,
  createFavorite,
  deleteFavorite,
  reorderFavorites,
} from './favoritesApi'

const FAVORITES_KEY = 'favorites'
const LOCAL_STORAGE_KEY = 'zyrp-favorites'

function getLocalFavorites(): UserFavorite[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function setLocalFavorites(favorites: UserFavorite[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(favorites))
}

export function useFavorites() {
  const { selectedTenant } = useTenant()
  const tenantId = selectedTenant?.tenant_id ?? ''
  const queryClient = useQueryClient()
  const [localFavorites, setLocalFavoritesState] = useState<UserFavorite[]>(getLocalFavorites)

  const query = useQuery({
    queryKey: [FAVORITES_KEY, tenantId],
    queryFn: ({ signal }) => getFavorites(tenantId, signal),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  })

  const favorites = query.data ?? localFavorites

  useEffect(() => {
    if (query.data) {
      setLocalFavorites(query.data)
    }
  }, [query.data])

  const addMutation = useMutation({
    mutationFn: (input: CreateFavoriteInput) => createFavorite(tenantId, input),
    onSuccess: (newFavorite) => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, tenantId] })
      setLocalFavoritesState((prev) => [...prev, newFavorite])
    },
  })

  const removeMutation = useMutation({
    mutationFn: (favoriteId: string) => deleteFavorite(tenantId, favoriteId),
    onSuccess: (_, favoriteId) => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, tenantId] })
      setLocalFavoritesState((prev) => prev.filter((f) => f.id !== favoriteId))
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (favoriteIds: string[]) => reorderFavorites(tenantId, favoriteIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY, tenantId] })
    },
  })

  const addFavorite = useCallback(
    (input: CreateFavoriteInput) => addMutation.mutate(input),
    [addMutation],
  )

  const removeFavorite = useCallback(
    (favoriteId: string) => removeMutation.mutate(favoriteId),
    [removeMutation],
  )

  const reorder = useCallback(
    (favoriteIds: string[]) => reorderMutation.mutate(favoriteIds),
    [reorderMutation],
  )

  const isFavorite = useCallback(
    (entityType: string, entityId: string | null) => {
      return favorites.some(
        (f) => f.entity_type === entityType && f.entity_id === entityId,
      )
    },
    [favorites],
  )

  return {
    favorites,
    isLoading: query.isLoading,
    error: query.error,
    addFavorite,
    removeFavorite,
    reorder,
    isFavorite,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
  }
}
