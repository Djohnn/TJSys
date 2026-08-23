import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'

import App from './App'
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
  it('renders semantic landmarks after auth resolves', async () => {
    renderApp()

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
        HttpResponse.json({ count: 0, next: null, previous: null, results: [] }),
      ),
    )

    const view = renderApp('/catalog/products/p1/prices')

    expect(await screen.findByRole('heading', { name: 'Venda varejo', level: 1 })).toBeVisible()

    server.use(
      http.get('/api/v1/catalog/products/p1/prices/', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Falha controlada', status: 422, detail: 'Falha controlada' },
          { status: 422, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )

    view.unmount()
    renderApp('/catalog/products/p1/prices')
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha controlada')
  })
})
