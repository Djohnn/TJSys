import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sale } from '../../pages/Sale';
import { getElectronAPI } from '../../../shared/electron';

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

  it('renders the kilogram symbol when the API provides only the unit name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-kg',
          sku: 'PDV-KG-001',
          name: 'Produto Quilograma',
          base_unit: 'unit-kg',
          unit_name: 'KG',
          price: '24.00',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto Quilograma' },
    });
    fireEvent.click(await screen.findByText('Produto Quilograma'));

    expect(await screen.findByText('Qtd: 1kg', { exact: true })).toBeInTheDocument();
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
    window.electronAPI = {
      ...getElectronAPI(),
      createSale,
      printReceipt,
      printBalcaoReceipt: printReceipt,
    };
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
    expect(printReceipt.mock.calls[0][0].html).toContain('x1.0');
    expect(browserPrint).not.toHaveBeenCalled();
  });

  it('RF01/RF13: finalizar venda não abre impressão automática nem dispara emissão fiscal', async () => {
    const printReceipt = vi.fn().mockResolvedValue({ success: true });
    const createSale = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'sale-auto-test',
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
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '49.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar Venda' });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    // Esperar venda ser concluída — toast aparece (RF03)
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('Venda nº sale-aut');

    // O carrinho deve estar limpo (estado resetado) — RF02
    expect(screen.getByText('Carrinho (0)')).toBeInTheDocument();

    // NENHUMA impressão deve ter sido disparada automaticamente (RF01, RF13)
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(printReceipt).not.toHaveBeenCalled();
  });

  it('RF05/RF06: Fechar no toast apenas oculta, sem impressão nem emissão fiscal', async () => {
    const printReceipt = vi.fn().mockResolvedValue({ success: true });
    const createSale = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'sale-close-test',
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
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '49.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar Venda' });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    // Toast exibido
    await screen.findByRole('status');

    // Clicar em Fechar (RF06)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    // Toast deve desaparecer
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    // Nenhuma impressão ou emissão fiscal foi disparada
    expect(printReceipt).not.toHaveBeenCalled();
  });

  it('RF11: venda é concluída independentemente da impressão (não bloqueante)', async () => {
    const createSale = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'sale-nb-test',
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
    (window as any).electronAPI = { createSale };
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
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '49.90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar Venda' });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    // Venda concluída — toast exibido (não bloqueante)
    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('Venda nº sale-nb');
    expect(createSale).toHaveBeenCalledOnce();

    // Carrinho resetado (estado pronto para nova venda)
    expect(screen.getByText('Carrinho (0)')).toBeInTheDocument();

    // Botão voltou ao estado inicial
    expect(confirmButton).toBeDisabled();
  });

  it('accepts an exact two-decimal payment for a fractional floating-point total', async () => {
    const createSale = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'sale-rounded-total',
        created_at: '2026-07-18T13:52:03-03:00',
        net_total: '59.70',
        items: [],
      },
    });
    window.electronAPI = { ...getElectronAPI(), createSale };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-rounded',
          sku: 'PDV-ROUND-001',
          name: 'Produto Arredondado',
          base_unit: 'unit-1',
          price: '19.90',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto Arredondado' },
    });
    fireEvent.click(await screen.findByText('Produto Arredondado'));
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '59.70' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirmar Venda' });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    fireEvent.click(confirmButton);

    await screen.findByRole('status');
    expect(createSale).toHaveBeenCalledOnce();
  });

  it('enables exact payment when binary floating-point totals round to the same cents', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        results: [{
          id: 'product-cents',
          sku: 'PDV-CENTS-001',
          name: 'Produto Centavos',
          base_unit: 'unit-1',
          price: '0.10',
        }],
      }), { status: 200 }),
    );

    render(
      <MemoryRouter>
        <Sale />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Buscar produto (SKU ou nome)...'), {
      target: { value: 'Produto Centavos' },
    });
    fireEvent.click(await screen.findByText('Produto Centavos'));
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '0.30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Pagamento' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar Venda' })).toBeEnabled());
  });
});
