import { test, expect, MOCK_API_KEY } from './fixtures';
import { LoginPage } from './pages/login.page';

test.describe('Login do PDV', () => {
  test('Given o operador acessa o PDV, When a tela carrega, Then o formulário de API Key é exibido', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.expectVisible();
    await expect(loginPage.helpLink).toBeVisible();
  });

  test('Given uma API Key inválida, When o operador tenta entrar, Then o erro do contrato é exibido', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login('invalid-key');
    await loginPage.expectError('API key inválida');
    await expect(loginPage.page).toHaveURL(/\/login/);
  });

  test('Given uma API Key válida, When o operador confirma, Then o PDV abre o dashboard', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.login(MOCK_API_KEY);
    await expect(loginPage.page).toHaveURL(/\/dashboard/);
    await expect(loginPage.page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
