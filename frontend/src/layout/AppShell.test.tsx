import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'

import AppShell from './AppShell'
import LoadingState from '@/components/LoadingState'
import EmptyState from '@/components/EmptyState'
import ErrorState from '@/errors/ErrorState'
import AppErrorBoundary from '@/errors/AppErrorBoundary'
import { AuthProvider } from '@/auth/AuthProvider'
import { TenantProvider } from '@/tenant/TenantProvider'

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function renderShell(path = '/') {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <TenantProvider>
            <AppShell />
          </TenantProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('renders skip link', async () => {
    renderShell()
    const skipLink = await screen.findByText('Pular para conteúdo')
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('renders semantic landmarks', async () => {
    renderShell()
    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders app title in header', async () => {
    renderShell()
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('TJSys ERP')
  })

  it('renders navigation with expected items', async () => {
    renderShell()
    const nav = await screen.findByTestId('main-navigation')
    expect(nav).toBeInTheDocument()

    const links = nav.querySelectorAll('a')
    const linkTexts = Array.from(links).map((l) => l.textContent)
    expect(linkTexts).toContain('Início')
    expect(linkTexts).toContain('Catálogo')
    expect(linkTexts).toContain('Estoque')
    expect(linkTexts).toContain('Vendas')
    expect(linkTexts).toContain('Financeiro')
    expect(linkTexts).toContain('Relatórios')
    expect(linkTexts).toContain('Administração')
  })

  it('shows the complete contextual catalog navigation', async () => {
    renderShell('/catalog/products')
    const contextual = await screen.findByTestId('catalog-context-navigation')
    for (const label of [
      'Produtos', 'Serviços', 'Combo', 'Categorias', 'Marcas',
      'Unidades de Medida', 'Impressão de Etiquetas',
    ]) {
      expect(within(contextual).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(within(contextual).getByRole('link', { name: 'Produtos' }))
      .toHaveAttribute('aria-current', 'page')
  })

  it('opens and closes the mobile navigation drawer', async () => {
    const user = userEvent.setup()
    renderShell('/catalog/products')

    const trigger = await screen.findByRole('button', { name: /abrir menu/i })
    await user.click(trigger)
    expect(screen.getByTestId('mobile-navigation-drawer')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('mobile-navigation-drawer')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('highlights active route', async () => {
    renderShell('/financial')
    const financialLink = await screen.findByText('Financeiro')
    expect(financialLink.closest('a')).toHaveAttribute('aria-current', 'page')
  })

  it('does not highlight inactive route', async () => {
    renderShell('/catalog')
    const financialLink = await screen.findByText('Financeiro')
    expect(financialLink.closest('a')).not.toHaveAttribute('aria-current')
  })

  it('renders logout button', async () => {
    renderShell()
    const logoutButton = await screen.findByRole('button', { name: /sair/i })
    expect(logoutButton).toBeInTheDocument()
  })

  it('renders data-testid on shell', async () => {
    renderShell()
    const shell = await screen.findByTestId('app-shell')
    expect(shell).toBeInTheDocument()
  })
})

describe('LoadingState', () => {
  it('renders with default message', () => {
    render(<LoadingState />)
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    expect(screen.getByText('Carregando…')).toBeInTheDocument()
  })

  it('renders with custom message', () => {
    render(<LoadingState message="Salvando…" />)
    expect(screen.getByText('Salvando…')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Vazio" description="Nenhum item encontrado" />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('Vazio')).toBeInTheDocument()
    expect(screen.getByText('Nenhum item encontrado')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="Vazio"
        action={<button>Criar novo</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Criar novo' })).toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('renders 401 with login button', async () => {
    const mockLogout = vi.fn()
    render(
      <ErrorState status={401} logout={mockLogout} />,
    )
    expect(screen.getByText('Sessão expirada')).toBeInTheDocument()
    const loginBtn = screen.getByRole('button', { name: /fazer login/i })
    await userEvent.click(loginBtn)
    expect(mockLogout).toHaveBeenCalled()
  })

  it('renders 403 as denied', () => {
    render(<ErrorState status={403} />)
    expect(screen.getByText('Acesso negado')).toBeInTheDocument()
  })

  it('renders 404 as not found', () => {
    render(<ErrorState status={404} />)
    expect(screen.getByText('Página não encontrada')).toBeInTheDocument()
  })

  it('renders 409 as conflict', () => {
    render(<ErrorState status={409} />)
    expect(screen.getByText('Conflito')).toBeInTheDocument()
  })

  it('renders 5xx as server error with retry', async () => {
    const onRetry = vi.fn()
    render(<ErrorState status={500} onRetry={onRetry} />)
    expect(screen.getByText('Erro no servidor')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /tentar novamente/i })
    await userEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows correlation ID when provided', () => {
    render(<ErrorState status={500} correlationId="corr-abc-123" />)
    expect(screen.getByText(/corr-abc-123/)).toBeInTheDocument()
  })

  it('renders custom message', () => {
    render(<ErrorState status={400} message="Algo deu errado" />)
    expect(screen.getByText('Algo deu errado')).toBeInTheDocument()
  })

  it('shows error boundary fallback', async () => {
    const Thrower = () => { throw new Error('test error') }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>,
    )
    expect(await screen.findByTestId('error-boundary')).toBeInTheDocument()
    expect(screen.getByText(/algo deu errado/i)).toBeInTheDocument()
    spy.mockRestore()
  })
})
