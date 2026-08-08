import { describe, expect, it } from 'vitest'

import { collectionItems, normalizeCollection } from './collections'

describe('normalizeCollection', () => {
  it('exports collectionItems for collection consumers', () => {
    expect(collectionItems([{ id: 'img-1' }])).toEqual([{ id: 'img-1' }])
  })

  it('returns items from a paginated results payload', () => {
    const item = { id: 'img-1' }

    expect(normalizeCollection({ count: 1, next: null, previous: null, results: [item] })).toEqual([item])
  })

  it('keeps raw array payloads unchanged', () => {
    const items = [{ id: 'img-1' }, { id: 'img-2' }]

    expect(normalizeCollection(items)).toEqual(items)
  })

  it('rejects malformed collection payloads', () => {
    expect(() => normalizeCollection(null)).toThrowError('Invalid collection response')
    expect(() => normalizeCollection({ results: 'not-an-array' })).toThrowError('Invalid collection response')
    expect(() => normalizeCollection({})).toThrowError('Invalid collection response')
  })
})
