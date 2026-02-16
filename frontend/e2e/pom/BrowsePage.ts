import type { Page, Locator } from '@playwright/test';

export class BrowsePage {
  private readonly page: Page;
  readonly grid: Locator;
  readonly gridItems: Locator;
  readonly emptyState: Locator;
  readonly uploadLink: Locator;
  readonly tagFilterInput: Locator;
  readonly noMatchText: Locator;
  readonly typeFilterAll: Locator;
  readonly typeFilterPictures: Locator;
  readonly typeFilterGifs: Locator;
  readonly typeFilterVideos: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.grid = page.locator('[data-testid="media-grid"]');
    this.gridItems = page.locator('[data-testid="media-grid"] a[href^="/media/"]');
    this.emptyState = page.getByText('No uploads yet');
    this.uploadLink = page.getByRole('link', { name: 'Upload something' });
    this.tagFilterInput = page.getByTestId('tag-input-field');
    this.noMatchText = page.getByText('No media matches the selected filters');
    this.typeFilterAll = page.getByTestId('type-filter-all');
    this.typeFilterPictures = page.getByTestId('type-filter-image');
    this.typeFilterGifs = page.getByTestId('type-filter-gif');
    this.typeFilterVideos = page.getByTestId('type-filter-video');
    this.searchInput = page.getByTestId('search-input');
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

  cardCopyButton(index: number) {
    return this.gridItems.nth(index).getByTitle('Copy to clipboard');
  }

  cardDownloadButton(index: number) {
    return this.gridItems.nth(index).getByTitle('Download');
  }

  cardTags(index: number) {
    return this.gridItems.nth(index).getByTestId('card-tag');
  }

  async filterByTag(tag: string) {
    await this.tagFilterInput.fill(tag);
    await this.tagFilterInput.press('Enter');
  }

  cardNames() {
    return this.grid.getByTestId('card-name');
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    // Wait for debounce (300ms) + network response
    await this.page.waitForResponse((res) => res.url().includes('/api/media'));
  }

  async clearSearch() {
    await this.searchInput.clear();
    await this.page.waitForResponse((res) => res.url().includes('/api/media'));
  }

  async scrollToLoadMore() {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
}
