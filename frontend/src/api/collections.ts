/**
 * Converts collection responses from the API into a predictable item array.
 *
 * Collection endpoints may return either a bare array or a paginated object
 * with a `results` array. Invalid payloads fail explicitly so optional
 * consumers (such as product media) can isolate the failure and keep running.
 */
export interface CollectionPage<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export function collectionItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[]
  }

  if (payload && typeof payload === 'object') {
    const results = (payload as { results?: unknown }).results
    if (Array.isArray(results)) {
      return results as T[]
    }
  }

  throw new Error('Invalid collection response')
}

/** Backwards-compatible name for collectionItems. */
export const normalizeCollection = collectionItems
