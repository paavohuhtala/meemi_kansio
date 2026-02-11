import type { Page, Locator } from '@playwright/test';

export class MediaPage {
  readonly image: Locator;
  readonly video: Locator;
  readonly title: Locator;
  readonly description: Locator;
  readonly meta: Locator;

  constructor(page: Page) {
    this.image = page.locator('img[src*="/api/files/"]');
    this.video = page.locator('video[src*="/api/files/"]');
    this.title = page.locator('h1');
    this.description = page.locator('p').first();
    this.meta = page.getByText(/Uploaded/);
  }
}
