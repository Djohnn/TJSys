import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sale } from '../../pages/Sale';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock('../../contexts/CashSessionContext', () => ({
  useCashSession: () => ({
    session: {
      sessionId: 'cash-1',
      status: 'open',
      openingAmount: '100.00',
      expectedAmount: '100.00',
      salesCount: 0,
      totalSales: '0.00',
    },
  }),
}));

describe('Sale', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('branch_id', 'branch-1');
    localStorage.setItem('stock_location_id', 'location-1');
    vi.restoreAllMocks();
  });

  it('shows a visible cash management action from the sale screen', () => {
    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Fechar Caixa' })).toBeInTheDocument();
  });

  it('adds API product with string price as numeric cart total', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-1',
          sku: 'PDV-001',
          name: 'Produto PDV',
          base_unit: 'unit-1',
          price: '49.90',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto PDV' },
    });

    fireEvent.click(await screen.findByText('Produto PDV'));

    await waitFor(() => {
      expect(screen.getByText('Carrinho (1)')).toBeInTheDocument();
      expect(screen.getAllByText('R$ 49.90').length).toBeGreaterThan(0);
    });
  });

  it('formats weighted cart quantities from flat product unit metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-kg',
          sku: 'PDV-KG',
          name: 'Arroz por quilo',
          base_unit: '123e4567-e89b-12d3-a456-426614174000',
          unit_symbol: 'kg',
          unit_precision: 3,
          price: '15.00',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Arroz por quilo' },
    });
    fireEvent.click(await screen.findByText('Arroz por quilo'));

    await waitFor(() => expect(screen.getByText('Qtd: 1kg')).toBeInTheDocument());
  });

  it('keeps a product without a valid price visible but rejects it without changing the cart', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-no-price',
          sku: 'PDV-002',
          name: 'Produto sem preço',
          base_unit: 'unit-1',
          price: null,
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto sem preço' },
    });

    const result = await screen.findByText('Produto sem preço');
    expect(screen.getByText('Sem preço')).toBeInTheDocument();
    fireEvent.click(result);

    await waitFor(() => {
      expect(screen.getByText('Carrinho (0)')).toBeInTheDocument();
      expect(screen.getByText('Produto sem preço não pode ser adicionado sem preço válido.')).toBeInTheDocument();
    });
  });

  it('shows printable receipt with product name and normalized quantity', async () => {
    const browserPrint = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const printReceipt = vi.fn().mockResolvedValue({
      success: true,
    });
    const createSale = vi.fn().mockResolvedValue({
      success: true,
      data: {
          id: 'sale-1',
          created_at: '2026-07-18T13:52:03-03:00',
          net_total: '49.90',
          items: [{
            id: 'item-1',
            product: 'product-1',
            quantity: '1.000000',
            line_total: '49.90',
          }],
      },
    });
    (window as any).electronAPI = { createSale, printReceipt };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-1',
          sku: 'PDV-001',
          name: 'Produto PDV',
          base_unit: 'unit-1',
          price: '49.90',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto PDV' },
    });
    fireEvent.click(await screen.findByText('Produto PDV'));
    fireEvent.change(screen.getByPlaceholderText('0,00'), {
      target: { value: '49.90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar Venda' });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('Venda nº sale-1 realizada com sucesso.');
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir Cupom Balcão' }));

    await waitFor(() => {
      expect(printReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'cupom_balcao_sale-1',
          html: expect.stringContaining('Produto PDV'),
        }),
      );
    });
    expect(printReceipt.mock.calls[0][0].html).toContain('1');
    expect(printReceipt.mock.calls[0][0].html).not.toContain('x1.0');
    expect(browserPrint).not.toHaveBeenCalled();
  });
});
