import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  public readonly usernameInput = this.page.getByPlaceholder('Username');
  public readonly passwordInput = this.page.getByPlaceholder('Password');
  public readonly submitButton = this.page.getByRole('button', { name: 'Log in' });

  async goto() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
