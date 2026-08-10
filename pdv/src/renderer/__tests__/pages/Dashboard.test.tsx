import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    deviceId: 'device-1',
    branchId: 'branch-1',
  }),
}));

vi.mock('../../contexts/CashSessionContext', () => ({
  useCashSession: () => ({
    session: {
      sessionId: 'cash-1',
      status: 'open',
      openingAmount: '100.00',
      expectedAmount: '100.00',
      salesCount: 1,
      totalSales: '49.90',
    },
    refreshSession: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Dashboard', () => {
  const mockSale = {
    id: 'sale-123456789',
    status: 'confirmed',
    net_total: '49.90',
    created_at: '2026-07-18T13:52:03-03:00',
    customer: 'João Silva',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    window.electronAPI = {
      getSaleDetail: vi.fn(),
      getProduct: vi.fn(),
      printReceipt: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a direct close cash action when cash session is open', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Fechar Caixa' })).toBeInTheDocument();
  });

  it('loads and renders recent sales from the API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockSale],
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/sales/?branch=branch-1&cash_session=cash-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });
    expect(await screen.findByText('#sale-123')).toBeInTheDocument();
    // Check the table cell with the total (there's also one in the summary card)
    const tableTotalCell = screen.getByTestId('sale-total-sale-123456789');
    expect(tableTotalCell).toHaveTextContent('49.90');
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
  });

  it('shows actions column with 3-dots button for each sale', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockSale],
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    expect(actionButton).toBeInTheDocument();
    expect(actionButton).toHaveTextContent('⋮');
    expect(actionButton).not.toBeDisabled();
  });

  it('opens dropdown menu when clicking 3-dots button', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockSale],
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);

    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });
    expect(screen.getByText('Reimprimir Cupom Balcão')).toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [mockSale],
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId('sale-menu-sale-123456789')).not.toBeInTheDocument();
    });
  });

  it('reprints receipt successfully and shows success message', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/request-fiscal/')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [mockSale],
      });
    }) as any;

    window.electronAPI.getSaleDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        items: [{ product: 'prod-1', quantity: '2', line_total: '24.95' }],
      },
    });
    window.electronAPI.getProduct.mockResolvedValue({
      success: true,
      data: { name: 'Coca-Cola 350ml' },
    });
    window.electronAPI.printReceipt.mockResolvedValue({
      success: true,
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reimprimir Cupom Balcão'));

    await waitFor(() => {
      expect(window.electronAPI.getSaleDetail).toHaveBeenCalledWith('sale-123456789');
      expect(window.electronAPI.getProduct).toHaveBeenCalledWith('prod-1');
    });
  });

  it('shows error message when getSaleDetail fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/request-fiscal/')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [mockSale],
      });
    }) as any;

    window.electronAPI.getSaleDetail.mockResolvedValue({
      success: false,
      error: 'Venda não encontrada',
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reimprimir Cupom Balcão'));

    await waitFor(() => {
      expect(screen.getByTestId('reprint-message')).toHaveTextContent('Erro ao buscar venda: Venda não encontrada');
    });
  });

  it('shows error message when printReceipt fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/request-fiscal/')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [mockSale],
      });
    }) as any;

    window.electronAPI.getSaleDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        items: [{ product: 'prod-1', quantity: '2', line_total: '24.95' }],
      },
    });
    window.electronAPI.getProduct.mockResolvedValue({
      success: true,
      data: { name: 'Coca-Cola 350ml' },
    });
    window.electronAPI.printReceipt.mockResolvedValue({
      success: false,
      error: 'Impressora não conectada',
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reimprimir Cupom Balcão'));

    await waitFor(() => {
      expect(screen.getByTestId('reprint-message')).toHaveTextContent('Falha na impressão: Impressora não conectada');
    });
  });

  it('disables action button while reprinting', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (url.includes('/request-fiscal/')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => [mockSale],
      });
    }) as any;

    let resolvePrint: (value: any) => void;
    const printPromise = new Promise((resolve) => {
      resolvePrint = resolve;
    });
    window.electronAPI.getSaleDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        items: [{ product: 'prod-1', quantity: '2', line_total: '24.95' }],
      },
    });
    window.electronAPI.getProduct.mockResolvedValue({
      success: true,
      data: { name: 'Coca-Cola 350ml' },
    });
    window.electronAPI.printReceipt.mockReturnValue(printPromise);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-123');
    const actionButton = screen.getByTestId('sale-actions-sale-123456789');
    fireEvent.click(actionButton);
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-123456789')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reimprimir Cupom Balcão'));

    await waitFor(() => {
      expect(actionButton).toBeDisabled();
      expect(actionButton).toHaveTextContent('...');
    });

    resolvePrint!({ success: true });
    await waitFor(() => {
      expect(actionButton).not.toBeDisabled();
      expect(actionButton).toHaveTextContent('⋮');
    });
  });
});
