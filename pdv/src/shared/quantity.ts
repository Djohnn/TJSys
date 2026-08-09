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

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value);

  const precision = options.precision == null
    ? null
    : Math.max(0, Math.min(6, Math.trunc(options.precision)));

  let rendered: string;
  if (precision === null) {
    rendered = numberValue.toFixed(6).replace(/\.?0+$/, '');
  } else if (precision === 0 || Number.isInteger(numberValue)) {
    rendered = numberValue.toFixed(0);
  } else {
    rendered = numberValue.toFixed(precision);
  }

  const rawSymbol = options.symbol?.trim() ?? '';
  const normalizedSymbol = rawSymbol.toLowerCase();
  const symbol = normalizedSymbol === 'un'
    ? ''
    : normalizedSymbol === 'kg'
      ? 'kg'
      : rawSymbol;
  return symbol ? `${rendered}${symbol}` : rendered;
}
