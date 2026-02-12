import type { Page, Locator } from '@playwright/test';

export class MediaPage {
  private page: Page;
  readonly image: Locator;
  readonly video: Locator;
  readonly title: Locator;
  readonly editName: Locator;

  readonly descriptionText: Locator;
  readonly descriptionInput: Locator;

  readonly tagList: Locator;
  readonly tagChips: Locator;
  readonly tagInput: Locator;

  readonly replaceFileButton: Locator;

  readonly deleteButton: Locator;
  readonly deleteConfirm: Locator;
  readonly deleteCancel: Locator;

  readonly copyButton: Locator;
  readonly downloadButton: Locator;

  readonly meta: Locator;

  constructor(page: Page) {
    this.page = page;
    this.image = page.locator('img[src*="/api/files/"]');
    this.video = page.locator('video[src*="/api/files/"]');
    this.title = page.locator('h1');
    this.editName = page.getByTestId('edit-name');

    this.descriptionText = page.getByTestId('description');
    this.descriptionInput = page.getByTestId('edit-description');

    this.tagList = page.getByTestId('tag-list');
    this.tagChips = this.tagList.getByTestId('tag-chip');
    this.tagInput = this.tagList.getByTestId('tag-input-field');

    this.replaceFileButton = page.getByTestId('replace-file');

    this.deleteButton = page.getByTestId('delete-button');
    this.deleteConfirm = page.getByTestId('delete-confirm');
    this.deleteCancel = page.getByTestId('delete-cancel');

    this.copyButton = page.getByTitle('Copy to clipboard');
    this.downloadButton = page.getByTitle('Download');

    this.meta = page.getByText(/Uploaded/);
  }

  async editTitle(name: string) {
    await this.title.click();
    await this.editName.fill(name);
    await this.editName.press('Enter');
  }

  async editDescription(description: string) {
    await this.descriptionText.click();
    await this.descriptionInput.fill(description);
    await this.descriptionInput.press('Enter');
  }

  async editMetadata(name: string, description: string) {
    await this.editTitle(name);
    await this.title.waitFor();
    await this.editDescription(description);
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
