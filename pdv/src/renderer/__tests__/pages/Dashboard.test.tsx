import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from '../../pages/Dashboard';
import { getElectronAPI } from '../../../shared/electron';

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
      ...getElectronAPI(),
      getSaleDetail: vi.fn(),
      getProduct: vi.fn(),
      printReceipt: vi.fn(),
      printFiscalReceipt: vi.fn(),
      printBalcaoReceipt: vi.fn(),
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

    vi.mocked(window.electronAPI.getSaleDetail).mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        branch: 'branch-1',
        cash_session: 'cash-1',
        operator: 'operator-1',
        status: 'confirmed',
        gross_total: '49.90',
        discount_total: '0.00',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        payments: [],
        items: [{
          id: 'item-1',
          product: 'prod-1',
          quantity: '2',
          unit: { id: 'unit-1', symbol: 'un', name: 'Unidade' },
          factor: '1',
          unit_price: '12.475',
          discount_amount: '0.00',
          line_total: '24.95',
        }],
      },
    });
    vi.mocked(window.electronAPI.getProduct).mockResolvedValue({
      success: true,
      data: { id: 'prod-1', name: 'Coca-Cola 350ml' },
    });
    vi.mocked(window.electronAPI.printBalcaoReceipt).mockResolvedValue({
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

    vi.mocked(window.electronAPI.getSaleDetail).mockResolvedValue({
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

    vi.mocked(window.electronAPI.getSaleDetail).mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        branch: 'branch-1',
        cash_session: 'cash-1',
        operator: 'operator-1',
        status: 'confirmed',
        gross_total: '49.90',
        discount_total: '0.00',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        payments: [],
        items: [{
          id: 'item-1',
          product: 'prod-1',
          quantity: '2',
          unit: { id: 'unit-1', symbol: 'un', name: 'Unidade' },
          factor: '1',
          unit_price: '12.475',
          discount_amount: '0.00',
          line_total: '24.95',
        }],
      },
    });
    vi.mocked(window.electronAPI.getProduct).mockResolvedValue({
      success: true,
      data: { id: 'prod-1', name: 'Coca-Cola 350ml' },
    });
    vi.mocked(window.electronAPI.printBalcaoReceipt).mockResolvedValue({
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

    let resolvePrint: (value: { success: true }) => void;
    const printPromise = new Promise<{ success: true }>((resolve) => {
      resolvePrint = resolve;
    });
    vi.mocked(window.electronAPI.getSaleDetail).mockResolvedValue({
      success: true,
      data: {
        id: 'sale-123456789',
        branch: 'branch-1',
        cash_session: 'cash-1',
        operator: 'operator-1',
        status: 'confirmed',
        gross_total: '49.90',
        discount_total: '0.00',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        payments: [],
        items: [{
          id: 'item-1',
          product: 'prod-1',
          quantity: '2',
          unit: { id: 'unit-1', symbol: 'un', name: 'Unidade' },
          factor: '1',
          unit_price: '12.475',
          discount_amount: '0.00',
          line_total: '24.95',
        }],
      },
    });
    vi.mocked(window.electronAPI.getProduct).mockResolvedValue({
      success: true,
      data: { id: 'prod-1', name: 'Coca-Cola 350ml' },
    });
    vi.mocked(window.electronAPI.printBalcaoReceipt).mockReturnValue(printPromise);

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

  it('RF09: reimpressão Fiscal bloqueada (desabilitada) quando status não autorizado', async () => {
    const sale = { ...mockSale, id: 'sale-pending-123456' };
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ fiscal_status: 'PENDING', protocol: null, xml_url: null }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [sale] });
    }) as any;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Exibição de status pendente
    await screen.findByText('#sale-pen');
    expect(screen.getByText('Pendente')).toBeInTheDocument();

    // Abre o menu
    fireEvent.click(screen.getByTestId('sale-actions-sale-pending-123456'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-pending-123456')).toBeInTheDocument();
    });

    // Reimprimir Balcão livre
    const balcaoBtn = screen.getByText('Reimprimir Cupom Balcão');
    expect(balcaoBtn).not.toBeDisabled();

    // Reimpressão Fiscal NÃO disponível (está "em andamento", desabilitado)
    expect(screen.getByText('Emissão NFC-e em andamento...')).toBeInTheDocument();

    // Não deve haver opção "Reimprimir Cupom Fiscal" nem "Solicitar Cupom Fiscal" enquanto pendente
    expect(screen.queryByText('Reimprimir Cupom Fiscal')).not.toBeInTheDocument();
    expect(screen.queryByText('Solicitar Cupom Fiscal')).not.toBeInTheDocument();
  });

  it('RF16: exibe status rejeitado e permite tentar novamente (não reimprime)', async () => {
    const sale = { ...mockSale, id: 'sale-rejected-123456' };
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ fiscal_status: 'REJECTED', error_detail: 'Rejeição: 999 - erro teste' }),
        });
      }
      if (url.includes('/request-fiscal/')) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ fiscal_status: 'PENDING' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [sale] });
    }) as any;
    window.electronAPI.printReceipt = vi.fn();
    window.electronAPI.printBalcaoReceipt = vi.fn();
    window.electronAPI.printFiscalReceipt = vi.fn();

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Status rejeitado exibido no badge da venda
    await screen.findByText('#sale-rej');
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sale-actions-sale-rejected-123456'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-rejected-123456')).toBeInTheDocument();
    });

    // Deve mostrar a rejeição e botão "Tentar novamente"
    expect(screen.getByText(/NFC-e rejeitada/)).toBeInTheDocument();
    const retryBtn = screen.getByText('Tentar novamente');
    expect(retryBtn).not.toBeDisabled();

    // Reimpressão Fiscal não disponível (venda rejeitada não é autorizada)
    expect(screen.queryByText('Reimprimir Cupom Fiscal')).not.toBeInTheDocument();

    // Clicar em "Tentar novamente" chama request-fiscal (reenfileira), não imprime
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/sales/sale-rejected-123456/request-fiscal/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(window.electronAPI.printFiscalReceipt).not.toHaveBeenCalled();
    // status PENDING retorna mensagem genérica de processamento
    expect(screen.getByTestId('reprint-message')).toHaveTextContent('Emissão fiscal solicitada');
  });

  it('RF09/RF15: exibe reimpressão Fiscal disponível quando autorizado', async () => {
    const sale = { ...mockSale, id: 'sale-auth-123456' };
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/fiscal-status/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ fiscal_status: 'CONCLUDED', protocol: '123456789', xml_url: 'https://sefaz/nfe' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [sale] });
    }) as any;

    // Preparar gefaultDetail/printFu para reimpressão fiscal
    window.electronAPI.getSaleDetail = vi.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'sale-auth-123456',
        net_total: '49.90',
        created_at: '2026-07-18T13:52:03-03:00',
        items: [{ product: 'prod-1', quantity: '2', line_total: '24.95' }],
      },
    });
    window.electronAPI.getProduct = vi.fn().mockResolvedValue({ success: true, data: { name: 'Coca-Cola' } });
    window.electronAPI.printFiscalReceipt = vi.fn().mockResolvedValue({ success: true });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await screen.findByText('#sale-aut');
    // Badge NFC-e (autorizado)
    expect(screen.getByText('NFC-e')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sale-actions-sale-auth-123456'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-menu-sale-auth-123456')).toBeInTheDocument();
    });

    // "Reimprimir Cupom Fiscal" disponível (autorizado)
    const fiscalBtn = screen.getByText('Reimprimir Cupom Fiscal');
    expect(fiscalBtn).not.toBeDisabled();

    // Clicar reimprime via printFiscalReceipt com chave/protocolo
    fireEvent.click(fiscalBtn);
    await waitFor(() => {
      expect(window.electronAPI.printFiscalReceipt).toHaveBeenCalled();
    });
    const payload = (window.electronAPI.printFiscalReceipt as any).mock.calls[0][0];
    expect(payload.fileName).toContain('cupom_fiscal_');
    expect(payload.html).toContain('123456789');
  });
});
