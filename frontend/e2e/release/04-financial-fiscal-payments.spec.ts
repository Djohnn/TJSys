import { expect } from '@playwright/test'
import { test } from '../fixtures'

test.describe('Financeiro, Fiscal e Pagamentos', () => {
  test('Lista de contas a receber carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await expect(page.getByTestId('receivables-table')).toBeVisible()
  })

  test('Lista de contas a pagar carrega com filtros de status', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/financial/payables')
    await expect(page.getByTestId('payables-page')).toBeVisible()
    await expect(page.getByTestId('payables-filters')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Filtrar por status' })).toBeVisible()
  })

  test('Fluxo de caixa carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/financial/cashflow')
    await expect(page.getByTestId('cashflow-page')).toBeVisible()
    await expect(page.getByTestId('cashflow-table')).toBeVisible()
  })

  test('Emitentes fiscais carregam com tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/fiscal/emitters')
    await expect(page.getByTestId('fiscal-config-page')).toBeVisible()
  })

  test('Documentos fiscais carregam com filtro de status', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/fiscal/documents')
    await expect(page.getByTestId('fiscal-documents-page')).toBeVisible()
    await expect(page.getByTestId('documents-table')).toBeVisible()
    await expect(page.getByTestId('filter-status')).toBeVisible()
  })

  test('Configurações de provedores de pagamento exibem tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/payments/provider-configs')
    await expect(page.getByTestId('provider-config-page')).toBeVisible()
    await expect(page.getByTestId('provider-config-table')).toBeVisible()
  })

  test('Dashboard de monitoramento de operações carrega com seção de saúde', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/app/monitoring/operations')
    await expect(page.getByTestId('operations-page')).toBeVisible()
    await expect(page.getByTestId('health-section')).toBeVisible()
  })
})
