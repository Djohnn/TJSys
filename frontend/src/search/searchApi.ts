import { apiRequest } from '@/api/client'

export interface SearchResult {
  type: 'product' | 'category' | 'brand' | 'person' | 'supplier' | 'route'
  id: string
  label: string
  subtitle: string
  route: string
  icon: string
}

export interface SearchResponse {
  results: SearchResult[]
}

export async function search(
  tenantId: string,
  query: string,
  limit = 10,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  if (query.length < 2) return []

  const response = await apiRequest<SearchResponse>(
    `/search/?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      tenantId,
      signal,
    },
  )

  return response?.results ?? []
}
