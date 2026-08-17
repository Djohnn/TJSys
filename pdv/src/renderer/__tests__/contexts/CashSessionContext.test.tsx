import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CashSessionProvider, useCashSession } from '../../contexts/CashSessionContext';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function TestComponent() {
  const { session, openSession, closeSession, clearSession } = useCashSession();
  return (
    <div>
      <span data-testid="session-status">{session.status}</span>
      <span data-testid="session-id">{session.sessionId || 'none'}</span>
      <span data-testid="opening-amount">{session.openingAmount}</span>
      <button data-testid="btn-open" onClick={() => openSession('branch-1', '100.00')}>Open</button>
      <button data-testid="btn-close" onClick={() => closeSession('200.00')}>Close</button>
      <button data-testid="btn-clear" onClick={() => clearSession()}>Clear</button>
    </div>
  );
}

function renderWithProviders() {
  return render(
    <MemoryRouter>
      <CashSessionProvider>
        <TestComponent />
      </CashSessionProvider>
    </MemoryRouter>
  );
}

describe('CashSessionContext', () => {
  it('starts closed with zero amounts', () => {
    renderWithProviders();
    expect(screen.getByTestId('session-status')).toHaveTextContent('closed');
    expect(screen.getByTestId('session-id')).toHaveTextContent('none');
    expect(screen.getByTestId('opening-amount')).toHaveTextContent('0.00');
  });

  it('restores session from localStorage', () => {
    localStorage.setItem('cash_session', JSON.stringify({
      sessionId: 'sess-1',
      status: 'open',
      openingAmount: '50.00',
      expectedAmount: '50.00',
      salesCount: 0,
      totalSales: '0.00',
    }));
    renderWithProviders();
    expect(screen.getByTestId('session-status')).toHaveTextContent('open');
    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-1');
    expect(screen.getByTestId('opening-amount')).toHaveTextContent('50.00');
  });

  it('openSession calls API and updates state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'sess-new',
        opening_amount: '100.00',
        expected_amount: '100.00',
      }), { status: 200 })
    );

    renderWithProviders();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('btn-open'));

    await waitFor(() => {
      expect(screen.getByTestId('session-status')).toHaveTextContent('open');
    });
    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-new');
  });

  it('clearSession resets to defaults', async () => {
    localStorage.setItem('cash_session', JSON.stringify({
      sessionId: 'sess-1', status: 'open', openingAmount: '50.00',
      expectedAmount: '50.00', salesCount: 3, totalSales: '150.00',
    }));
    renderWithProviders();
    expect(screen.getByTestId('session-id')).toHaveTextContent('sess-1');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('btn-clear'));

    expect(screen.getByTestId('session-status')).toHaveTextContent('closed');
    expect(screen.getByTestId('session-id')).toHaveTextContent('none');
  });

  it('sends Idempotency-Key when opening cash session', async () => {
    localStorage.setItem('access_token', 'token-1');
    localStorage.setItem('tenant_id', 'tenant-1');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        id: 'sess-new',
        opening_amount: '100.00',
        expected_amount: '100.00',
      }), { status: 200 })
    );

    renderWithProviders();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('btn-open'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/cash-sessions/open/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': expect.any(String),
            Authorization: 'Bearer token-1',
            'X-Tenant-ID': 'tenant-1',
          }),
        })
      );
    });
  });

  it('sends Idempotency-Key when closing cash session', async () => {
    localStorage.setItem('cash_session', JSON.stringify({
      sessionId: 'cash-1',
      status: 'open',
      openingAmount: '100.00',
      expectedAmount: '200.00',
      salesCount: 1,
      totalSales: '100.00',
    }));
    localStorage.setItem('access_token', 'token-1');
    localStorage.setItem('tenant_id', 'tenant-1');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'closed' }), { status: 200 })
    );

    renderWithProviders();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('btn-close'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/cash-sessions/cash-1/close/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': expect.any(String),
            Authorization: 'Bearer token-1',
            'X-Tenant-ID': 'tenant-1',
          }),
        })
      );
    });
  });
});
