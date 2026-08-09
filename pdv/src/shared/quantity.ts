export interface QuantityFormatOptions {
  /** Number of decimal places configured for the unit. */
  precision?: number | null;
  /** Optional unit symbol appended to the rendered quantity. */
  symbol?: string | null;
}

/**
 * Formats a quantity for display without changing the value sent to the API.
 * Count quantities are rendered without trailing decimal noise; weighted
 * quantities keep their configured precision and unit symbol.
 */
export function formatQuantity(
  value: string | number | null | undefined,
  options: QuantityFormatOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '--';

  const source = String(value).trim();
  const parsed = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(source);
  if (!parsed) return String(value);
  const [, sign, whole, rawFraction = ''] = parsed;

  const precision = options.precision == null
    ? null
    : Math.max(0, Math.min(6, Math.trunc(options.precision)));

  const meaningfulFraction = rawFraction.replace(/0+$/, '');
  let rendered: string;
  if (precision === null) {
    rendered = meaningfulFraction ? `${sign}${whole}.${meaningfulFraction}` : `${sign}${whole}`;
  } else if (precision === 0 || !meaningfulFraction) {
    rendered = `${sign}${whole}`;
  } else {
    rendered = `${sign}${whole}.${rawFraction.slice(0, precision).padEnd(precision, '0')}`;
  }

  const rawSymbol = options.symbol?.trim() ?? '';
  const normalizedSymbol = rawSymbol.toLowerCase();
  const symbol = precision === 0 || normalizedSymbol === 'un'
    ? ''
    : normalizedSymbol === 'kg'
      ? 'kg'
      : rawSymbol;
  return symbol ? `${rendered}${symbol}` : rendered;
}
