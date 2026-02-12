import { e2eTest, expect } from '../fixtures.ts';
import path from 'node:path';

const TEST_DATA_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('uploader', 'password123');
  await page.waitForURL('/');
});

e2eTest('upload JPG', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
  await expect(mediaPage.title).toHaveText('sokerivarasto');
  await expect(mediaPage.meta).toBeVisible();
});

e2eTest('upload PNG without name or description', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('markus.png');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
  await expect(mediaPage.meta).toBeVisible();
});

e2eTest('upload GIF displays as image', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('questionable_ethics.gif');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
});

e2eTest('upload MP4 displays as video', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('kitten_horn.mp4');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.video).toBeVisible();
});

e2eTest('upload MOV displays as video', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('ei_tallasta.mov');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.video).toBeVisible();
});

e2eTest('selecting unsupported file type does not show preview', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'invalid.unknown'),
  );

  await expect(uploadPage.previewImage).not.toBeVisible();
  await expect(uploadPage.previewVideo).not.toBeVisible();
  await expect(uploadPage.submitButton).toBeDisabled();
});

e2eTest('shows image preview after selecting file', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  await expect(uploadPage.previewImage).toBeVisible();
});

e2eTest('shows video preview after selecting file', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'kitten_horn.mp4'),
  );

  await expect(uploadPage.previewVideo).toBeVisible();
});
