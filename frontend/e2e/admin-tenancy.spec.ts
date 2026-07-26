import { expect } from '@playwright/test'
import { test } from './fixtures'

test.describe('Painel administrativo de tenancy', () => {
  test('Dashboard exibe painel com cards de módulos', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-page')).toBeVisible()
    await expect(page.getByTestId('module-cards')).toBeVisible()
    const cards = page.getByTestId(/^card-/)
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('Empresas page mostra lista de empresas', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/organization/companies')
    await expect(page.getByTestId('companies-page')).toBeVisible()
  })

  test('Filiais page mostra lista de filiais', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/organization/branches')
    await expect(page.getByTestId('branches-page')).toBeVisible()
  })

  test('Membros page mostra lista de membros', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/access/members')
    await expect(page.getByTestId('members-page')).toBeVisible()
  })

  test('Convites page permite criar convite', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/access/invitations')
    await expect(page.getByTestId('invitations-page')).toBeVisible()

    await page.getByRole('button', { name: 'Novo Convite' }).click()
    await expect(page.getByTestId('invitation-form')).toBeVisible()

    await page.fill('#invite-email', 'novo.membro@test.local')
    await page.selectOption('#invite-role', 'operator')
    await page.getByRole('button', { name: 'Convidar' }).click()
  })

  test('Página de segurança MFA carrega', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/security/mfa')
    await expect(page.getByTestId('mfa-policy-page')).toBeVisible()
  })

  test('Dispositivos page lista dispositivos', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/devices')
    await expect(page.getByTestId('devices-page')).toBeVisible()
  })

  test('Navegação admin contém links corretos', async ({ authenticatedPage }) => {
    const page = authenticatedPage
    await page.goto('/dashboard')
    await expect(page.getByTestId('main-navigation')).toBeVisible()

    const adminLinks = ['Empresas', 'Filiais', 'Membros', 'Convites', 'Segurança', 'Dispositivos']
    for (const label of adminLinks) {
      await expect(
        page.getByTestId('main-navigation').getByRole('link', { name: label }),
      ).toBeVisible()
    }
  })
})
