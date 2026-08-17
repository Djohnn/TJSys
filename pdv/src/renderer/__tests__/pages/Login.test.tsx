import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { Login } from '../../pages/Login';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders the login form elements', () => {
    renderLogin();
    expect(screen.getByLabelText('Chave de API (API Key)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Digite sua API Key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('shows error message when login fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'API key inv\u00E1lida' }), { status: 401 })
    );
    renderLogin();
    fireEvent.change(screen.getByLabelText('Chave de API (API Key)'), { target: { value: 'bad-key' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    await waitFor(() => {
      expect(screen.getByText('API key inv\u00E1lida')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows success message and navigates to dashboard on success', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          token: 'new-token',
          refresh_token: 'new-refresh',
          device_id: 'dev-2',
          branch_id: 'branch-2',
          tenant_id: 'tenant-2',
        }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'stock-location-2', is_primary: true }), { status: 200 })
      );
    renderLogin();
    fireEvent.change(screen.getByLabelText('Chave de API (API Key)'), { target: { value: 'valid-key' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Login realizado com sucesso!')).toBeInTheDocument();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    expect(localStorage.getItem('stock_location_id')).toBe('stock-location-2');
  });

  it('shows default error when API returns no detail field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 401 })
    );
    renderLogin();
    fireEvent.change(screen.getByLabelText('Chave de API (API Key)'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Invalid API key')).toBeInTheDocument();
    });
  });

  it('shows loading state during login', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(() => {}));
    renderLogin();
    fireEvent.change(screen.getByLabelText('Chave de API (API Key)'), { target: { value: 'x' } });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Entrando...')).toBeInTheDocument();
    });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows error when fetch fails (network error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => Promise.reject(new Error('Network failure')));
    renderLogin();
    fireEvent.change(screen.getByLabelText('Chave de API (API Key)'), { target: { value: 'key' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.getByText(/Network failure/)).toBeInTheDocument();
    });
  });
});
