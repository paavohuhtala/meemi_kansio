import type { Page, Locator } from '@playwright/test';
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

export class UploadPage {
  private readonly page: Page;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly errorText: Locator;
  readonly dropZone: Locator;
  readonly previewImage: Locator;
  readonly previewVideo: Locator;
  readonly resultsGrid: Locator;
  readonly resultCards: Locator;
  readonly uploadMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByTestId('upload-submit');
    this.errorText = page.getByText(/unsupported|failed|error/i);
    this.dropZone = page.getByTestId('drop-zone');
    this.previewImage = page.getByTestId('upload-preview-image');
    this.previewVideo = page.getByTestId('upload-preview-video');
    this.resultsGrid = page.getByTestId('results-grid');
    this.resultCards = page.getByTestId('result-card');
    this.uploadMoreButton = page.getByTestId('upload-more');
  }

  async goto() {
    await this.page.goto('/upload');
  }

  async upload(fileName: string) {
    await this.goto();
    await this.fileInput.setInputFiles(path.join(TEST_DATA_DIR, fileName));
    await this.submitButton.click();
  }

  async selectFiles(fileNames: string[]) {
    await this.fileInput.setInputFiles(
      fileNames.map((f) => path.join(TEST_DATA_DIR, f)),
    );
  }

  resultCardLinks() {
    return this.resultsGrid.locator('a[href^="/media/"]');
  }

  retryButton(index: number) {
    return this.resultCards.nth(index).getByTestId('retry-button');
  }
}
