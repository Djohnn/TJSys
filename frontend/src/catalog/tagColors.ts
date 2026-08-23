export const DEFAULT_TAG_COLOR = '--color-tag-gray'

export const COLOR_OPTIONS = [
  { value: '--color-tag-gray', label: 'Cinza' },
  { value: '--color-tag-red', label: 'Vermelho' },
  { value: '--color-tag-yellow', label: 'Amarelo' },
  { value: '--color-tag-green', label: 'Verde' },
  { value: '--color-tag-blue', label: 'Azul' },
  { value: '--color-tag-purple', label: 'Roxo' },
  { value: '--color-tag-pink', label: 'Rosa' },
  { value: '--color-tag-teal', label: 'Teal' },
] as const

/** Resolve a UI token immediately before a Tag API write; API colors remain HEX strings. */
export function resolveTagColor(value: string): string {
  if (!value.startsWith('--color-tag-') || typeof document === 'undefined') return value

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(value).trim()
  return resolved || value
}
