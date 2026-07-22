import { expect } from '@playwright/test'
import { test } from '../fixtures'

test.describe('Financeiro, Fiscal e Pagamentos', () => {
  test('Lista de contas a receber carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/receivables')
    await expect(page.getByTestId('receivables-page')).toBeVisible()
    await expect(page.getByTestId('receivables-table')).toBeVisible()
  })

  test('Lista de contas a pagar carrega com filtros de status', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/payables')
    await expect(page.getByTestId('payables-page')).toBeVisible()
    await expect(page.getByTestId('payables-table')).toBeVisible()
    await expect(page.getByTestId('payables-status-filter')).toBeVisible()
  })

  test('Fluxo de caixa carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/financial/cashflow')
    await expect(page.getByTestId('cashflow-page')).toBeVisible()
    await expect(page.getByTestId('cashflow-table')).toBeVisible()
  })

  test('Emitentes fiscais carregam com tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/fiscal/emitters')
    await expect(page.getByTestId('emitters-page')).toBeVisible()
    await expect(page.getByTestId('emitters-table')).toBeVisible()
  })

  test('Documentos fiscais carregam com filtro de status', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/fiscal/documents')
    await expect(page.getByTestId('documents-page')).toBeVisible()
    await expect(page.getByTestId('documents-table')).toBeVisible()
    await expect(page.getByTestId('documents-status-filter')).toBeVisible()
  })

  test('Configurações de provedores de pagamento exibem tabela', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/payments/provider-configs')
    await expect(page.getByTestId('provider-configs-page')).toBeVisible()
    await expect(page.getByTestId('provider-configs-table')).toBeVisible()
  })

  test('Dashboard de monitoramento de operações carrega com seção de saúde', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/monitoring/operations')
    await expect(page.getByTestId('operations-page')).toBeVisible()
    await expect(page.getByTestId('health-section')).toBeVisible()
  })
})