import { expect, type Page } from '@playwright/test';

export class AdminPage {
  constructor(private readonly page: Page) {}

  public readonly heading = this.page.getByRole('heading', { name: 'Admin' });
  public readonly newInviteButton = this.page.getByRole('button', { name: 'New invite' });
  public readonly inviteCode = this.page.locator('code').first();

  async createInvite(): Promise<string> {
    await this.newInviteButton.click();
    await expect(this.inviteCode).toBeVisible();
    const code = await this.inviteCode.textContent();
    return code!;
  }
}
