import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'

import App, { AppRouteFallback } from './App'
import AppErrorBoundary from '@/errors/AppErrorBoundary'
import { server } from '@/test/server'

function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

describe('App shell', () => {
  beforeEach(() =>
    vi.spyOn(console, 'error').mockImplementation(() => undefined),
  )
  afterEach(() => vi.restoreAllMocks())
  it('renders a recoverable fallback when a lazy chunk rejects', async () => {
    const BrokenChunk = lazy(() =>
      Promise.reject(new Error('chunk load failed')),
    )

    render(
      <AppErrorBoundary>
        <Suspense fallback={<div>Carregando chunk...</div>}>
          <BrokenChunk />
        </Suspense>
      </AppErrorBoundary>,
    )

    expect(await screen.findByTestId('error-boundary')).toBeInTheDocument()
    expect(
      screen.getByText('Algo deu errado. Tente recarregar a página.'),
    ).toBeInTheDocument()
  })

  it('renders a 404 state instead of a blank screen for a legacy root admin URL', async () => {
    renderApp('/catalog/products')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Página não encontrada',
    )
  })

  it('exposes an accessible fallback while an admin page chunk loads', () => {
    render(<AppRouteFallback />)

    expect(
      screen.getByRole('status', { name: 'Carregando aplicação' }),
    ).toBeInTheDocument()
  })

  it('renders semantic landmarks after auth resolves', async () => {
    renderApp('/app')

    await waitFor(() => {
      expect(screen.getByRole('banner')).toBeInTheDocument()
    })
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('r4 renders Venda varejo and reports Problem Details errors', async () => {
    server.use(
      http.get('/api/v1/catalog/products/p1/prices/', () =>
        HttpResponse.json({
          id: 'price-1',
          product: 'p1',
          amount: '100.00',
          cost: '75.00',
          retail_margin: '25.00',
          currency: 'BRL',
          tiers: [],
          version: 1,
        }),
      ),
      http.get('/api/v1/catalog/products/p1/price-tiers/', () =>
        HttpResponse.json({
          count: 0,
          next: null,
          previous: null,
          results: [],
        }),
      ),
    )

    const view = renderApp('/app/catalog/products/p1/prices')

    expect(
      await screen.findByRole('heading', { name: 'Venda varejo', level: 1 }),
    ).toBeVisible()

    server.use(
      http.get('/api/v1/catalog/products/p1/prices/', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            title: 'Falha controlada',
            status: 422,
            detail: 'Falha controlada',
          },
          {
            status: 422,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      ),
    )

    view.unmount()
    renderApp('/app/catalog/products/p1/prices')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha controlada',
    )
  })
})
