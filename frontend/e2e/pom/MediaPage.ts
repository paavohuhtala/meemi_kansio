import type { Page, Locator } from '@playwright/test';

export class MediaPage {
  private page: Page;
  readonly image: Locator;
  readonly video: Locator;
  readonly title: Locator;
  readonly editName: Locator;

  readonly descriptionText: Locator;
  readonly descriptionInput: Locator;

  readonly tagEditor: Locator;
  readonly tagChips: Locator;
  readonly removedTagChips: Locator;
  readonly addTagButton: Locator;
  readonly addTagInput: Locator;
  readonly saveTagsButton: Locator;
  readonly cancelTagsButton: Locator;

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

    this.tagEditor = page.getByTestId('tag-editor');
    this.tagChips = this.tagEditor.getByTestId('tag-chip');
    this.removedTagChips = this.tagEditor.getByTestId('removed-tag-chip');
    this.addTagButton = this.tagEditor.getByTestId('add-tag-button');
    this.addTagInput = this.tagEditor.getByTestId('add-tag-input');
    this.saveTagsButton = this.tagEditor.getByTestId('save-tags');
    this.cancelTagsButton = this.tagEditor.getByTestId('cancel-tags');

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

  async addTag(name: string) {
    await this.addTagButton.click();
    await this.addTagInput.fill(name);
    await this.addTagInput.press('Enter');
    await this.addTagInput.press('Escape');
  }

  async removeTag(name: string) {
    await this.tagChips.filter({ hasText: name }).getByRole('button').click();
  }

  async saveTags() {
    const saved = this.page.waitForResponse(
      (res) => res.url().includes('/tags') && res.request().method() === 'PUT',
    );
    await this.saveTagsButton.click();
    await saved;
  }

  async cancelTagEdit() {
    await this.cancelTagsButton.click();
  }

  async editTags({ add, remove }: { add?: string[]; remove?: string[] }) {
    if (remove) {
      for (const tag of remove) {
        await this.removeTag(tag);
      }
    }
    if (add) {
      await this.addTagButton.click();
      for (const tag of add) {
        await this.addTagInput.fill(tag);
        await this.addTagInput.press('Enter');
      }
      await this.addTagInput.press('Escape');
    }
    await this.saveTags();
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
