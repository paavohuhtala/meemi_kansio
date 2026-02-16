import type { Page, Locator } from '@playwright/test';
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

export class UploadPage {
  private readonly page: Page;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly errorText: Locator;
  readonly dropZone: Locator;
  readonly previewGrid: Locator;
  readonly fileCards: Locator;
  readonly addFileCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByTestId('upload-submit');
    this.errorText = page.getByText(/unsupported|failed|error/i);
    this.dropZone = page.getByTestId('drop-zone');
    this.previewGrid = page.getByTestId('preview-grid');
    this.fileCards = page.getByTestId('file-card');
    this.addFileCard = page.getByTestId('add-file-card');
  }

  async goto() {
    await this.page.goto('/upload');
  }

  async upload(fileName: string) {
    await this.goto();
    await this.fileInput.first().setInputFiles(path.join(TEST_DATA_DIR, fileName));
    await this.submitButton.click();
    // Wait for the success card to appear (file-card containing a link to /media/)
    const successLink = this.previewGrid.locator('a[href^="/media/"]').first();
    await successLink.waitFor();
    // Success links have target="_blank", so navigate directly instead of clicking
    const href = await successLink.getAttribute('href');
    if (!href) throw new Error('Success card link has no href attribute');
    await this.page.goto(href);
  }

  async selectFiles(fileNames: string[]) {
    await this.fileInput.first().setInputFiles(
      fileNames.map((f) => path.join(TEST_DATA_DIR, f)),
    );
  }

  successCardLinks() {
    return this.previewGrid.locator('a[href^="/media/"]');
  }

  retryButton(index: number) {
    return this.fileCards.nth(index).getByTestId('retry-button');
  }
}
