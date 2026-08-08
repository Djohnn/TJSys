import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly apiKeyInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly helpLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'TJSys PDV' });
    this.apiKeyInput = page.getByLabel('Chave de API (API Key)');
    this.submitButton = page.getByRole('button', { name: 'Entrar' });
    this.errorMessage = page.getByText(/API key|Erro/);
    this.successMessage = page.getByText('Login realizado com sucesso!');
    this.helpLink = page.getByRole('link', { name: 'Obter API Key no painel web' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async fillApiKey(apiKey: string) {
    await this.apiKeyInput.fill(apiKey);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(apiKey: string) {
    await this.fillApiKey(apiKey);
    await this.submit();
  }

  async expectVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.apiKeyInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async expectError(text?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (text) {
      await expect(this.errorMessage).toContainText(text);
    }
  }

  async expectSuccess() {
    await expect(this.successMessage).toBeVisible();
  }
}
