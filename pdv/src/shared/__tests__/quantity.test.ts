import { describe, expect, it } from 'vitest';
import { formatQuantity } from '../quantity';

describe('formatQuantity', () => {
  it('removes trailing decimal noise from count quantities', () => {
    expect(formatQuantity('3.000000', { precision: 0, symbol: 'UN' })).toBe('3');
    expect(formatQuantity(0, { precision: null })).toBe('0');
  });

  it('keeps unit precision and appends the unit symbol', () => {
    expect(formatQuantity('1.000000', { precision: 3, symbol: 'kg' })).toBe('1kg');
    expect(formatQuantity('0.500000', { precision: 3, symbol: 'kg' })).toBe('0.500kg');
  });

  it('returns invalid values unchanged', () => {
    expect(formatQuantity('not-a-number')).toBe('not-a-number');
  });
});
