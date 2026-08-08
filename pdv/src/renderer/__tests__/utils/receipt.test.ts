import { describe, it, expect } from 'vitest';
import { escapeHtml, formatReceiptQuantity, buildReceiptHtml } from '../../utils/receipt';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&b');
  });
  it('escapes <, >, ", \'', () => {
    expect(escapeHtml('<>"\'')).toBe('<>"&#039;');
  });
  it('preserves plain text', () => {
    expect(escapeHtml('Produto A')).toBe('Produto A');
  });
});

describe('formatReceiptQuantity', () => {
  it('formats number with one decimal', () => {
    expect(formatReceiptQuantity(2)).toBe('2.0');
    expect(formatReceiptQuantity(2.5)).toBe('2.5');
  });
  it('formats string number', () => {
    expect(formatReceiptQuantity('3')).toBe('3.0');
  });
  it('returns the input string for non-finite numbers', () => {
    expect(formatReceiptQuantity('abc')).toBe('abc');
  });
});

describe('buildReceiptHtml', () => {
  it('renders header and totals for a sale', () => {
    const html = buildReceiptHtml({
      id: 'sale-123456789',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '49.90',
      items: [
        { product: { name: 'Coca-Cola' }, quantity: 2, line_total: '10.00' },
      ],
    });
    expect(html).toContain('<title>TJSys PDV - Cupom Não Fiscal #sale-123</title>');
    expect(html).toContain('Coca-Cola');
    expect(html).toContain('x2.0');
    expect(html).toContain('R$ 10.00');
    expect(html).toContain('R$ 49.90');
  });

  it('falls back to "Produto" when product name is missing', () => {
    const html = buildReceiptHtml({
      id: 'abc',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '5.00',
      items: [{ product: null, quantity: 1, line_total: '5.00' }],
    });
    expect(html).toContain('Produto');
  });

  it('handles missing items array', () => {
    const html = buildReceiptHtml({
      id: 'empty',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '0.00',
    });
    expect(html).toContain('R$ 0.00');
    expect(html).toContain('<section class="items"></section>');
  });

  it('escapes sale id to prevent XSS in title', () => {
    const html = buildReceiptHtml({
      id: '<script>alert(1)</script>',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '1.00',
    });
    // escapeHtml converts < to < so script tag is neutralized - only <script> appears (no alert(1))
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('<script>');
  });
});