import type { Page } from '@playwright/test';

export class NavBar {
  constructor(private readonly page: Page) {}

  public readonly adminItem = this.page.getByRole('menuitem', { name: 'Admin' });
  public readonly logoutItem = this.page.getByRole('menuitem', { name: 'Log out' });

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
