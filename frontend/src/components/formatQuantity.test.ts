import { describe, expect, it } from 'vitest'

import { formatQuantity } from './formatQuantity'

describe('formatQuantity', () => {
  it('renders integer units without decimal noise', () => {
    expect(formatQuantity('10.000000', { precision: 0 })).toBe('10')
    expect(formatQuantity('100.000000', { precision: 0 })).toBe('100')
    expect(formatQuantity('101.000000', { precision: 0 })).toBe('101')
    expect(formatQuantity('1000.000000', { precision: 0 })).toBe('1000')
  })

  it('keeps meaningful decimal precision for kg and appends its symbol', () => {
    expect(formatQuantity('1.000000', { precision: 3, symbol: 'kg' })).toBe('1kg')
    expect(formatQuantity('0.500000', { precision: 3, symbol: 'kg' })).toBe('0.500kg')
    expect(formatQuantity('1.250000', { precision: 3, symbol: 'kg' })).toBe('1.250kg')
    expect(formatQuantity('1.000000', { precision: 3, symbol: 'KG' })).toBe('1kg')
  })

  it('does not append count-unit symbols', () => {
    expect(formatQuantity('10.000000', { precision: 0, symbol: 'UN' })).toBe('10')
    expect(formatQuantity('1.2345', { precision: 3, symbol: 'kg' })).toBe('1.234kg')
    expect(formatQuantity('2.000', { precision: 0, symbol: 'L' })).toBe('2')
    expect(formatQuantity('3.000', { precision: 0, symbol: 'SC' })).toBe('3')
    expect(formatQuantity('9007199254740993.000000', { precision: 0, symbol: 'UN' })).toBe('9007199254740993')
  })
})
