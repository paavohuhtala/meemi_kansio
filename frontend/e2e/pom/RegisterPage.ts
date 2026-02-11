import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private readonly page: Page) {}

  public readonly usernameInput = this.page.getByPlaceholder('Username');
  public readonly passwordInput = this.page.getByPlaceholder('Password');
  public readonly inviteCodeInput = this.page.getByPlaceholder('Invite code');
  public readonly submitButton = this.page.getByRole('button', { name: 'Create account' });

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
