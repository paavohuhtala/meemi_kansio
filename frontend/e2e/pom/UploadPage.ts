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

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByRole('button', { name: 'Upload', exact: true });
    this.errorText = page.getByText(/unsupported|failed|error/i);
    this.dropZone = page.getByTestId('drop-zone');
    this.previewImage = page.getByTestId('upload-preview-image');
    this.previewVideo = page.getByTestId('upload-preview-video');
  }

  async goto() {
    await this.page.goto('/upload');
  }

  async upload(fileName: string) {
    await this.goto();
    await this.fileInput.setInputFiles(path.join(TEST_DATA_DIR, fileName));
    await this.submitButton.click();
  }
}
