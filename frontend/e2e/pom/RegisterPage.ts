import type { Page, Locator } from '@playwright/test';

export class RegisterPage {
  private readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly inviteCodeInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByPlaceholder('Username');
    this.passwordInput = page.getByPlaceholder('Password');
    this.inviteCodeInput = page.getByPlaceholder('Invite code');
    this.submitButton = page.getByRole('button', { name: 'Create account' });
  }

  async goto() {
    await this.page.goto('/register');
  }

  async register(username: string, password: string, inviteCode?: string) {
    await this.goto();
    if (inviteCode) await this.inviteCodeInput.fill(inviteCode);
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
