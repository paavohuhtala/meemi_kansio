import type { Page, Locator } from '@playwright/test';

export class BrowsePage {
  private readonly page: Page;
  readonly grid: Locator;
  readonly gridItems: Locator;
  readonly emptyState: Locator;
  readonly uploadLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.grid = page.locator('[data-testid="media-grid"]');
    this.gridItems = page.locator('[data-testid="media-grid"] a');
    this.emptyState = page.getByText('No uploads yet');
    this.uploadLink = page.getByRole('link', { name: 'Upload something' });
  }

  async goto() {
    await this.page.goto('/');
  }

  gridImages() {
    return this.grid.locator('img');
  }

  gridVideos() {
    return this.grid.locator('video');
  }
}
