import type { Page, Locator } from '@playwright/test';
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

export class UploadPage {
  private readonly page: Page;
  readonly fileInput: Locator;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly submitButton: Locator;
  readonly errorText: Locator;
  readonly dropZone: Locator;
  readonly previewImage: Locator;
  readonly previewVideo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.nameInput = page.getByPlaceholder('Give it a name');
    this.descriptionInput = page.getByPlaceholder('Add a description');
    this.submitButton = page.getByRole('button', { name: 'Upload', exact: true });
    this.errorText = page.getByText(/unsupported|failed|error/i);
    this.dropZone = page.getByTestId('drop-zone');
    this.previewImage = page.getByTestId('upload-preview-image');
    this.previewVideo = page.getByTestId('upload-preview-video');
  }

  async goto() {
    await this.page.goto('/upload');
  }

  async upload(fileName: string, options?: { name?: string; description?: string; tags?: string[] }) {
    await this.goto();
    await this.fileInput.setInputFiles(path.join(TEST_DATA_DIR, fileName));
    if (options?.name) await this.nameInput.fill(options.name);
    if (options?.description) await this.descriptionInput.fill(options.description);
    if (options?.tags) {
      const tagField = this.page.getByTestId('tag-input-field');
      for (const tag of options.tags) {
        await tagField.fill(tag);
        await tagField.press('Enter');
      }
    }
    await this.submitButton.click();
  }
}
