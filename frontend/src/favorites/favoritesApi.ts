import { apiRequest } from '@/api/client'

export interface UserFavorite {
  id: string
  entity_type: string
  entity_id: string | null
  label: string
  route: string
  position: number
  icon: string
  created_at: string
}

export interface CreateFavoriteInput {
  entity_type: string
  entity_id?: string | null
  label: string
  route: string
  position?: number
  icon?: string
}

interface PaginatedFavoritesResponse {
  count: number
  next: string | null
  previous: string | null
  results: UserFavorite[]
}

export async function getFavorites(tenantId: string, signal?: AbortSignal): Promise<UserFavorite[]> {
  const result = await apiRequest<UserFavorite[] | PaginatedFavoritesResponse>('/favorites/', {
    tenantId,
    signal,
  })
  if (Array.isArray(result)) return result
  return result?.results ?? []
}

export async function createFavorite(
  tenantId: string,
  input: CreateFavoriteInput,
  signal?: AbortSignal,
): Promise<UserFavorite> {
  const result = await apiRequest<UserFavorite>('/favorites/', {
    method: 'POST',
    body: input,
    tenantId,
    signal,
  })
  return result as UserFavorite
}

export async function deleteFavorite(
  tenantId: string,
  favoriteId: string,
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest(`/favorites/${favoriteId}/`, {
    method: 'DELETE',
    tenantId,
    signal,
  })
}

export async function reorderFavorites(
  tenantId: string,
  favoriteIds: string[],
  signal?: AbortSignal,
): Promise<void> {
  await apiRequest('/favorites/reorder/', {
    method: 'PUT',
    body: { favorite_ids: favoriteIds },
    tenantId,
    signal,
  })
}
