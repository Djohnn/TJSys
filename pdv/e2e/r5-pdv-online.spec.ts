import { test, expect, MOCK_PRODUCTS, MOCK_SESSION_ID, MOCK_STOCK_LOCATION_ID } from './fixtures';

test.describe('R5 — PDV desktop online', () => {
  test('Given o operador autenticado, When consulta o caixa, Then o estado fechado é exibido', async ({ authedPage }) => {
    await authedPage.goto('/cash-session');

    await expect(authedPage.getByRole('heading', { name: 'Gestão de Caixa' })).toBeVisible();
    await expect(authedPage.getByRole('heading', { name: 'Nenhum caixa aberto' })).toBeVisible();
    await expect(authedPage.getByRole('button', { name: 'Abrir Caixa' })).toBeVisible();
  });

  test('Given o caixa fechado, When o operador abre com fundo inicial, Then a sessão fica aberta', async ({ authedPage }) => {
    await authedPage.goto('/cash-session');
    await authedPage.getByLabel('Valor de Abertura').fill('100.00');
    await authedPage.getByRole('button', { name: 'Abrir Caixa' }).click();

    await expect(authedPage).toHaveURL(/\/dashboard/);
    await expect(authedPage.getByText('Caixa aberto', { exact: true })).toBeVisible();
    await expect(authedPage.evaluate(() => JSON.parse(localStorage.getItem('cash_session') || '{}'))).resolves.toMatchObject({
      sessionId: MOCK_SESSION_ID,
      status: 'open',
      openingAmount: '100.00',
    });
  });

  test('Given o operador autenticado, When busca no catálogo, Then produtos com e sem preço são apresentados', async ({ authedPage }) => {
    await authedPage.goto('/cash-session');
    await authedPage.getByLabel('Valor de Abertura').fill('100.00');
    await authedPage.getByRole('button', { name: 'Abrir Caixa' }).click();
    await authedPage.goto('/sale');

    const search = authedPage.getByPlaceholder('Buscar produto (SKU ou nome)...');
    await search.fill('Café');
    await expect(authedPage.getByText(MOCK_PRODUCTS.coffee.name, { exact: true })).toBeVisible();
    await expect(authedPage.getByText(MOCK_PRODUCTS.kilo.name, { exact: true })).toBeVisible();

    await search.fill('sem preço');
    await expect(authedPage.getByText(MOCK_PRODUCTS.withoutPrice.name, { exact: true })).toBeVisible();
    await authedPage.getByText(MOCK_PRODUCTS.withoutPrice.name, { exact: true }).click();
    await expect(authedPage.getByText(/não pode ser adicionado sem preço válido/i)).toBeVisible();
    await expect(authedPage.getByText('Carrinho vazio')).toBeVisible();
  });

  test('Given o caixa aberto e um produto precificado, When recebe em dinheiro e confirma, Then a venda e o recebimento são confirmados', async ({ authedPage }) => {
    // Aguarda o refresh inicial do caixa terminar antes de abrir: caso contrário,
    // o 404 tardio de /current pode limpar a sessão recém-aberta.
    const closedSessionResponse = authedPage.waitForResponse(
      (response) => response.url().includes('/api/v1/cash-sessions/current/') && response.status() === 404,
    );
    await authedPage.goto('/cash-session');
    await closedSessionResponse;
    await authedPage.getByLabel('Valor de Abertura').fill('100.00');
    await authedPage.getByRole('button', { name: 'Abrir Caixa' }).click();
    await authedPage.goto('/sale');

    await authedPage.getByPlaceholder('Buscar produto (SKU ou nome)...').fill('CAF-001');
    await authedPage.getByText(MOCK_PRODUCTS.coffee.name, { exact: true }).click();
    await authedPage.getByPlaceholder('0,00').fill('20.00');
    await authedPage.getByRole('button', { name: 'Adicionar Pagamento' }).click();
    await expect(authedPage.getByText('Dinheiro', { exact: true }).last()).toBeVisible();
    await expect(authedPage.getByText(/Troco:/)).toBeVisible();

    await authedPage.getByRole('button', { name: 'Confirmar Venda' }).click();
    await expect(authedPage.getByRole('status')).toContainText('Venda nº mock-sal realizada com sucesso.');
    await expect(authedPage.getByRole('button', { name: 'Imprimir Cupom Balcão' })).toBeVisible();

    await expect(authedPage.evaluate(() => (window as any).__e2eSaleCalls)).resolves.toEqual([
      expect.objectContaining({
        branch: 'mock-branch-id',
        stock_location: MOCK_STOCK_LOCATION_ID,
        items: [expect.objectContaining({ product: MOCK_PRODUCTS.coffee.id, quantity: '1' })],
        payments: [expect.objectContaining({ method: 'cash', amount: '19.90' })],
      }),
    ]);
  });
});
