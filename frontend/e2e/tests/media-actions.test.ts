import path from 'node:path';
import { e2eTest, expect } from '../fixtures.ts';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('editor', 'password123');
  await page.waitForURL('/');
});

e2eTest('edit name and description', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await mediaPage.editMetadata('Updated Name', 'Updated Desc');

  await expect(mediaPage.title).toHaveText('Updated Name');
  await expect(page.getByText('Updated Desc')).toBeVisible();
});

e2eTest('editing title preserves description and vice versa', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  // Set initial title and description
  await mediaPage.editMetadata('My Title', 'My Description');

  // Edit title only
  await mediaPage.editTitle('New Title');
  await expect(mediaPage.title).toHaveText('New Title');
  await expect(mediaPage.descriptionText).toHaveText('My Description');

  // Edit description only
  await mediaPage.editDescription('New Description');
  await expect(page.getByText('New Description')).toBeVisible();
  await expect(mediaPage.title).toHaveText('New Title');
});

e2eTest('replace file changes the image', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  const originalSrc = await mediaPage.image.getAttribute('src');

  await mediaPage.replaceFile(path.join(TEST_DATA_DIR, 'markus.png'));

  await expect(mediaPage.image).not.toHaveAttribute('src', originalSrc!);
});

e2eTest('delete cancel keeps media', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await mediaPage.deleteButton.click();
  await mediaPage.deleteCancel.click();

  await expect(mediaPage.title).toHaveText('sokerivarasto');
  await expect(page).toHaveURL(/\/media\//);
});

e2eTest('delete with confirmation redirects to home', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await mediaPage.deleteWithConfirmation();

  await expect(page).toHaveURL('/');
});

e2eTest('deleted media disappears from browse', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await mediaPage.deleteWithConfirmation();
  await expect(page).toHaveURL('/');

  await browsePage.goto();
  await expect(browsePage.emptyState).toBeVisible();
});
