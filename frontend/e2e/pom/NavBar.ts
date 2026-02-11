import type { Page, Locator } from '@playwright/test';

export class NavBar {
  private readonly page: Page;
  readonly adminItem: Locator;
  readonly logoutItem: Locator;

  constructor(page: Page) {
    this.page = page;
    this.adminItem = page.getByRole('menuitem', { name: 'Admin' });
    this.logoutItem = page.getByRole('menuitem', { name: 'Log out' });
  }

  menuButton(username: string) {
    return this.page.getByRole('button', { name: new RegExp(username) });
  }

  async openMenu(username: string) {
    await this.menuButton(username).click();
  }

  async logout(username: string) {
    await this.openMenu(username);
    await this.logoutItem.click();
  }

  async goToAdmin(username: string) {
    await this.openMenu(username);
    await this.adminItem.click();
  }
}
