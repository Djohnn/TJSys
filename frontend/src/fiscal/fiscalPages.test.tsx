import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import { AuthContext } from '@/auth/AuthProvider'
import type { AuthContextValue } from '@/auth/AuthProvider'
import { TenantContext } from '@/tenant/TenantProvider'
import type { TenantContextValue } from '@/tenant/TenantProvider'
import { server } from '@/test/server'

import FiscalConfigPage from './FiscalConfigPage'
import FiscalDocumentsPage from './FiscalDocumentsPage'
import FiscalDocumentDetailPage from './FiscalDocumentDetailPage'
import PurchaseFiscalReconciliationPage from './PurchaseFiscalReconciliationPage'

const BASE = '/api/v1'

const authValue: AuthContextValue = {
  state: 'authenticated',
  user: { id: 1, email: 'admin@tjsys.local', name: 'Admin', is_active: true, is_mfa_enabled: false },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  login: async () => ({ requiresMfa: false }),
  logout: async () => {},
  challengeMfa: async () => {},
  verifyRecovery: vi.fn(),
} as AuthContextValue

const tenantValue: TenantContextValue = {
  selectedTenant: { id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' },
  memberships: [{ id: 1, tenant_id: 'tenant-alpha', tenant_name: 'Alpha', role: 'admin' }],
  selectTenant: () => {},
} as TenantContextValue

const EMITTERS = {
  count: 2, next: null, previous: null,
  results: [
    { id: 'emit-1', branch: 'br-1', provider: 'plugnotas', cpf_cnpj: '12345678000199', ie: '123456789', registered_at_provider: true, registration_source: 'manual', is_active: true, configured: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'emit-2', branch: 'br-2', provider: 'nfce', cpf_cnpj: '98765432000188', ie: '987654321', registered_at_provider: false, registration_source: 'manual', is_active: true, configured: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
}

const DOCUMENTS = {
  count: 3, next: null, previous: null,
  results: [
    { id: 'doc-1', direction: 'OUTPUT', status: 'CONCLUDED', attempt_number: 1, cfop: '5102', protocol: '123456', xml_key: 's3://doc.xml', pdf_key: 's3://doc.pdf', error_detail: '', created_at: '2026-07-20T00:00:00Z', updated_at: '2026-07-20T00:00:00Z', sale: 's-1' },
    { id: 'doc-2', direction: 'OUTPUT', status: 'REJECTED', attempt_number: 1, cfop: '5102', protocol: '', xml_key: '', pdf_key: '', error_detail: 'Rejeição 999', created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-21T00:00:00Z', sale: 's-1' },
    { id: 'doc-3', direction: 'OUTPUT', status: 'PENDING', attempt_number: 1, cfop: '5102', protocol: '', xml_key: '', pdf_key: '', error_detail: '', created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', sale: 's-2' },
  ],
}

const DOC_DETAIL_MAP: Record<string, Record<string, unknown>> = {
  'doc-1': { ...DOCUMENTS.results[0], timeline: [{ status: 'PENDING', created_at: '2026-07-19T00:00:00Z' }, { status: 'PROCESSING', created_at: '2026-07-20T00:00:00Z' }, { status: 'CONCLUDED', created_at: '2026-07-20T00:00:00Z' }] },
  'doc-2': { ...DOCUMENTS.results[1], timeline: [{ status: 'PENDING', created_at: '2026-07-21T00:00:00Z' }, { status: 'REJECTED', created_at: '2026-07-21T00:00:00Z' }] },
  'doc-3': { ...DOCUMENTS.results[2], timeline: [{ status: 'PENDING', created_at: '2026-07-22T00:00:00Z' }] },
}

type PageType = 'config' | 'documents' | 'detail' | 'reconciliation'

function renderPage(type: PageType, detailId = 'doc-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const routeMap: Record<PageType, string> = {
    config: '/fiscal/emitters',
    documents: '/fiscal/documents',
    detail: `/fiscal/documents/${detailId}`,
    reconciliation: '/fiscal/reconciliation',
  }
  const routePath = routeMap[type]

  render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={authValue}>
        <TenantContext.Provider value={tenantValue}>
          <MemoryRouter initialEntries={[routePath]}>
            <Routes>
              <Route path="/fiscal/emitters" element={<FiscalConfigPage />} />
              <Route path="/fiscal/documents" element={<FiscalDocumentsPage />} />
              <Route path="/fiscal/documents/:id" element={<FiscalDocumentDetailPage />} />
              <Route path="/fiscal/reconciliation" element={<PurchaseFiscalReconciliationPage />} />
            </Routes>
          </MemoryRouter>
        </TenantContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('FiscalPages', () => {
  beforeEach(() => {
    server.use(
      http.get(`${BASE}/fiscal/emitters/`, () => HttpResponse.json(EMITTERS)),
      http.post(`${BASE}/fiscal/emitters/`, async ({ request }) => {
        const body = await request.json() as Record<string, string>
        return HttpResponse.json({ id: 'emit-new', branch: body.branch, provider: body.provider, cpf_cnpj: body.cpf_cnpj, ie: body.ie || '', configured: true, registered_at_provider: true, registration_source: 'manual', is_active: true, created_at: '2026-07-22T00:00:00Z', updated_at: '2026-07-22T00:00:00Z' }, { status: 201 })
      }),
      http.patch(`${BASE}/fiscal/emitters/:id/`, async ({ params }) => HttpResponse.json({ ...EMITTERS.results[0], id: String(params.id), configured: true })),
      http.get(`${BASE}/fiscal/documents/`, () => HttpResponse.json(DOCUMENTS)),
      http.get(`${BASE}/fiscal/documents/:id/`, ({ params }) => {
        const detail = DOC_DETAIL_MAP[String(params.id)]
        return detail ? HttpResponse.json(detail) : HttpResponse.json(null, { status: 404 })
      }),
      http.post(`${BASE}/fiscal/documents/doc-2/retry/`, () => HttpResponse.json({ ...DOCUMENTS.results[1], status: 'PROCESSING' })),
      http.post(`${BASE}/fiscal/documents/doc-1/retry/`, () => new HttpResponse(null, { status: 409 })),
      http.post(`${BASE}/fiscal/documents/doc-3/cancel/`, () => HttpResponse.json({ ...DOCUMENTS.results[2], status: 'CANCELLED' })),
      http.get(`${BASE}/fiscal/documents/doc-1/xml/`, () => new HttpResponse('<xml>stub</xml>', { headers: { 'Content-Type': 'application/xml' } })),
      http.get(`${BASE}/fiscal/documents/doc-3/xml/`, () => new HttpResponse(null, { status: 403 })),
      http.get(`${BASE}/fiscal/documents/doc-1/pdf/`, () => new HttpResponse('pdf stub', { headers: { 'Content-Type': 'application/pdf' } })),
      http.get(`${BASE}/fiscal/documents/doc-2/pdf/`, () => new HttpResponse(null, { status: 403 })),
      http.post(`${BASE}/receipts/:id/validate-fiscal/`, () => HttpResponse.json({ issues: ['NCM ausente'], warnings: ['CFOP divergente'], requires_attention: true, created: true, document_id: 'fd-1' })),
    )
  })

  it('emitter list renders table', async () => {
    renderPage('config')
    await waitFor(() => expect(screen.getByTestId('fiscal-config-page')).toBeInTheDocument())
    expect(screen.getByTestId('emitter-table')).toBeInTheDocument()
    expect(screen.getAllByTestId('emitter-row')).toHaveLength(2)
  })

  it('emitter form opens with api_key field', async () => {
    renderPage('config')
    await waitFor(() => expect(screen.getByTestId('new-emitter-btn')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('new-emitter-btn'))
    expect(screen.getByTestId('emitter-form')).toBeInTheDocument()
    expect(screen.getByTestId('form-api-key')).toBeInTheDocument()
    const apiKeyInput = screen.getByTestId('form-api-key') as HTMLInputElement
    expect(apiKeyInput.placeholder).toBe('••••••••')
  })

  it('emitter edit blanks api_key', async () => {
    renderPage('config')
    await waitFor(() => expect(screen.getByTestId('emitter-table')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('edit-emitter-emit-1'))
    await waitFor(() => expect(screen.getByTestId('emitter-form')).toBeInTheDocument())
    const apiKeyInput = screen.getByTestId('form-api-key') as HTMLInputElement
    expect(apiKeyInput.value).toBe('')
  })

  it('document list shows status badges', async () => {
    renderPage('documents')
    await waitFor(() => expect(screen.getByTestId('fiscal-documents-page')).toBeInTheDocument())
    expect(screen.getByTestId('documents-table')).toBeInTheDocument()
    expect(screen.getByTestId('doc-status-doc-1').textContent).toBe('Concluído')
  })

  it('document detail shows timeline', async () => {
    renderPage('detail', 'doc-1')
    await waitFor(() => expect(screen.getByTestId('fiscal-document-detail-page')).toBeInTheDocument())
    expect(screen.getByTestId('document-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-entry-0')).toBeInTheDocument()
  })

  it('retry button opens reason dialog', async () => {
    renderPage('detail', 'doc-2')
    await waitFor(() => expect(screen.getByTestId('retry-btn')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('retry-btn'))
    await waitFor(() => expect(screen.getByTestId('retry-dialog')).toBeInTheDocument())
  })

  it('cancel button opens dialog', async () => {
    renderPage('detail', 'doc-3')
    await waitFor(() => expect(screen.getByTestId('cancel-btn')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.click(screen.getByTestId('cancel-btn'))
    await waitFor(() => expect(screen.getByTestId('cancel-dialog')).toBeInTheDocument())
  })

  it('xml download visible for concluded', async () => {
    renderPage('detail', 'doc-1')
    await waitFor(() => expect(screen.getByTestId('xml-download-link')).toBeInTheDocument())
  })

  it('xml download hidden for pending', async () => {
    renderPage('detail', 'doc-3')
    await waitFor(() => expect(screen.getByTestId('fiscal-document-detail-page')).toBeInTheDocument())
    expect(screen.queryByTestId('xml-download-link')).toBeNull()
  })

  it('pdf download visible for concluded', async () => {
    renderPage('detail', 'doc-1')
    await waitFor(() => expect(screen.getByTestId('pdf-download-link')).toBeInTheDocument())
  })

  it('pdf download hidden for rejected', async () => {
    renderPage('detail', 'doc-2')
    await waitFor(() => expect(screen.getByTestId('doc-detail-status')).toBeInTheDocument())
    expect(screen.queryByTestId('pdf-download-link')).toBeNull()
  })

  it('reconciliation form validates and shows issues', async () => {
    renderPage('reconciliation')
    await waitFor(() => expect(screen.getByTestId('purchase-fiscal-reconciliation-page')).toBeInTheDocument())
    const user = userEvent.setup()
    await user.type(screen.getByTestId('reconciliation-receipt-id'), 'rec-123')
    await user.type(screen.getByTestId('reconciliation-cfop'), '1102')
    await user.click(screen.getByTestId('validate-btn'))
    await waitFor(() => expect(screen.getByTestId('reconciliation-result')).toBeInTheDocument())
    expect(screen.getByTestId('reconciliation-issues')).toBeInTheDocument()
  })

  it('configured badge shows correct status', async () => {
    renderPage('config')
    await waitFor(() => expect(screen.getByTestId('configured-badge-emit-1')).toBeInTheDocument())
    expect(screen.getByTestId('configured-badge-emit-1').textContent).toBe('Configurado')
    expect(screen.getByTestId('configured-badge-emit-2').textContent).toBe('Pendente')
  })
})