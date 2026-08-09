import Decimal from 'decimal.js'

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
  value: string | number | Decimal | null | undefined,
  options: QuantityFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '--'

  let decimal: Decimal
  try {
    decimal = new Decimal(value)
  } catch {
    return String(value)
  }

  const precision = options.precision == null ? null : Math.max(0, Math.min(6, options.precision))
  // Keep the legacy locale rendering for payloads from older endpoints that
  // do not yet include unit metadata. New responses always provide precision.
  if (precision === null && !options.symbol) {
    return String(value).replace('.', ',')
  }
  let rendered: string

  if (precision === null) {
    rendered = decimal.toFixed().replace(/\.0+$/, '')
  } else if (precision === 0 || decimal.isInteger()) {
    rendered = decimal.toFixed(0)
  } else {
    rendered = decimal.toFixed(precision)
  }

  const normalizedSymbol = options.symbol?.trim().toLowerCase()
  const symbol = normalizedSymbol === 'kg' ? 'kg' : ''
  return symbol ? `${rendered}${symbol}` : rendered
}
