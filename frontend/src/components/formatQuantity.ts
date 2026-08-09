export interface QuantityFormatOptions {
  /** Number of meaningful decimal places configured on the unit. */
  precision?: number | null
  /** Optional unit symbol to append (for example, kg). */
  symbol?: string | null
}

/**
 * Formats API decimal quantities for display without changing their payload.
 * Unit precision is only presentation metadata; callers continue sending the
 * original decimal string to the API.
 */
export function formatQuantity(
  value: string | number | null | undefined,
  options: QuantityFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '--'

  const source = String(value).trim()
  const parsed = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(source)
  if (!parsed) return String(value)
  const [, sign, whole, rawFraction = ''] = parsed
  const precision = options.precision == null ? null : Math.max(0, Math.min(6, options.precision))
  // Keep the legacy locale rendering for payloads from older endpoints that
  // do not yet include unit metadata. New responses always provide precision.
  if (precision === null && !options.symbol) {
    return source.replace('.', ',')
  }
  const meaningfulFraction = rawFraction.replace(/0+$/, '')
  let rendered: string
  if (precision === null) {
    rendered = meaningfulFraction ? `${sign}${whole}.${meaningfulFraction}` : `${sign}${whole}`
  } else if (precision === 0 || !meaningfulFraction) {
    rendered = `${sign}${whole}`
  } else {
    rendered = `${sign}${whole}.${rawFraction.slice(0, precision).padEnd(precision, '0')}`
  }

  const rawSymbol = options.symbol?.trim() ?? ''
  const normalizedSymbol = rawSymbol.toLowerCase()
  const symbol = precision === 0 || normalizedSymbol === 'un' ? '' : normalizedSymbol === 'kg' ? 'kg' : rawSymbol
  return symbol ? `${rendered}${symbol}` : rendered
}
