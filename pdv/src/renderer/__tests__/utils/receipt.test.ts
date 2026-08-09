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
  it('formats count quantities without decimal noise', () => {
    expect(formatReceiptQuantity(2)).toBe('2');
    expect(formatReceiptQuantity('3.000000')).toBe('3');
  });

  it('formats weighted quantities with their unit precision', () => {
    expect(formatReceiptQuantity('1.000000', { precision: 3, symbol: 'kg' })).toBe('1kg');
    expect(formatReceiptQuantity('0.500000', { precision: 3, symbol: 'kg' })).toBe('0.500kg');
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
    expect(html).toContain('2');
    expect(html).not.toContain('x2.0');
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

  it('renders weighted quantities with unit metadata and no x prefix', () => {
    const html = buildReceiptHtml({
      id: 'weighted',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '7.50',
      items: [{
        product: { name: 'Arroz', base_unit: { symbol: 'kg', precision: 3 } },
        quantity: '0.500000',
        line_total: '7.50',
      }],
    });
    expect(html).toContain('0.500kg');
    expect(html).not.toContain('x0.500');
  });

  it('does not render a UUID unit id as a receipt symbol', () => {
    const unitId = '123e4567-e89b-12d3-a456-426614174000';
    const html = buildReceiptHtml({
      id: 'unit-id',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '10.00',
      items: [{ product: { name: 'Produto' }, unit: unitId, quantity: '1.000000', line_total: '10.00' }],
    });
    expect(html).toContain('class="muted">1</div>');
    expect(html).not.toContain(unitId);
  });

  it('uses flat unit metadata when the receipt unit is a UUID', () => {
    const html = buildReceiptHtml({
      id: 'flat-unit-metadata',
      created_at: '2026-07-18T13:52:03-03:00',
      net_total: '7.50',
      items: [{
        product: { name: 'Arroz' },
        unit: '123e4567-e89b-12d3-a456-426614174000',
        unit_symbol: 'kg',
        unit_precision: 3,
        quantity: '0.500000',
        line_total: '7.50',
      }],
    });
    expect(html).toContain('0.500kg');
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
