export interface QuantityFormatOptions {
  precision?: number | null;
  symbol?: string | null;
}

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
