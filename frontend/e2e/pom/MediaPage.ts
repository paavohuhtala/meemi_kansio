import type { Page, Locator } from '@playwright/test';

export class MediaPage {
  private page: Page;
  readonly image: Locator;
  readonly video: Locator;
  readonly title: Locator;
  readonly description: Locator;
  readonly meta: Locator;

  readonly editButton: Locator;
  readonly editName: Locator;
  readonly editDescription: Locator;
  readonly saveEdit: Locator;
  readonly cancelEdit: Locator;

  readonly replaceFileButton: Locator;

  readonly deleteButton: Locator;
  readonly deleteConfirm: Locator;
  readonly deleteCancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.image = page.locator('img[src*="/api/files/"]');
    this.video = page.locator('video[src*="/api/files/"]');
    this.title = page.locator('h1');
    this.description = page.locator('p').first();
    this.meta = page.getByText(/Uploaded/);

    this.editButton = page.getByTestId('edit-button');
    this.editName = page.getByTestId('edit-name');
    this.editDescription = page.getByTestId('edit-description');
    this.saveEdit = page.getByTestId('save-edit');
    this.cancelEdit = page.getByRole('button', { name: 'Cancel' });

    this.replaceFileButton = page.getByTestId('replace-file');

    this.deleteButton = page.getByTestId('delete-button');
    this.deleteConfirm = page.getByTestId('delete-confirm');
    this.deleteCancel = page.getByTestId('delete-cancel');
  }

  async editMetadata(name: string, description: string) {
    await this.editButton.click();
    await this.editName.fill(name);
    await this.editDescription.fill(description);
    await this.saveEdit.click();
  }

  async replaceFile(filePath: string) {
    const fileChooserPromise = this.page.waitForEvent('filechooser');
    await this.replaceFileButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath);
  }

  async deleteWithConfirmation() {
    await this.deleteButton.click();
    await this.deleteConfirm.click();
  }
}
