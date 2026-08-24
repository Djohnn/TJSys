import { beforeEach, describe, expect, it } from 'vitest'

import { isTagColorSelected, resolveTagColor } from './tagColors'

describe('tag color resolution', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--color-tag-red', '#EF4444')
  })

  it('Given a semantic token, When a tag is submitted, Then it resolves to the backend HEX contract', () => {
    expect(resolveTagColor('--color-tag-red')).toBe('#EF4444')
  })

  it('Given a HEX color returned by the API, When a tag is edited, Then it remains unchanged', () => {
    expect(resolveTagColor('#123456')).toBe('#123456')
  })

  it('Given a HEX color returned by the API, When a swatch is rendered, Then its semantic token is selected', () => {
    expect(isTagColorSelected('#EF4444', '--color-tag-red')).toBe(true)
    expect(isTagColorSelected('#EF4444', '--color-tag-blue')).toBe(false)
  })
})
