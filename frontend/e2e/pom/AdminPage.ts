import { expect, type Page, type Locator } from '@playwright/test';

export class AdminPage {
  readonly heading: Locator;
  readonly newInviteButton: Locator;
  readonly inviteCode: Locator;

  constructor(page: Page) {
    this.heading = page.getByRole('heading', { name: 'Admin' });
    this.newInviteButton = page.getByRole('button', { name: 'New invite' });
    this.inviteCode = page.locator('code').first();
  }

  async createInvite(): Promise<string> {
    await this.newInviteButton.click();
    await expect(this.inviteCode).toBeVisible();
    const code = await this.inviteCode.textContent();
    return code!;
  }
}
