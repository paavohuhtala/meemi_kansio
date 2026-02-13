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

e2eTest('upload JPG returns thumbnail URLs', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  expect(data.thumbnail_url).toBeTruthy();
  expect(data.thumbnail_url).toContain('_thumb.webp');
  expect(data.clipboard_url).toBeTruthy();
  expect(data.clipboard_url).toContain('_clipboard.png');
});

e2eTest('thumbnail files are servable after upload', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  const thumbRes = await page.request.get(data.thumbnail_url);
  expect(thumbRes.ok()).toBe(true);

  const clipboardRes = await page.request.get(data.clipboard_url);
  expect(clipboardRes.ok()).toBe(true);
});

e2eTest('upload MP4 returns thumbnail URL', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'kitten_horn.mp4'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  expect(data.thumbnail_url).toBeTruthy();
  expect(data.thumbnail_url).toContain('_thumb.webp');
  expect(data.clipboard_url).toBeNull();
});

e2eTest('video thumbnail file is servable after upload', async ({ page, uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.fileInput.setInputFiles(
    path.join(TEST_DATA_DIR, 'kitten_horn.mp4'),
  );

  const responsePromise = page.waitForResponse(
    (res) => res.url().includes('/api/media/upload') && res.status() === 200,
  );
  await uploadPage.submitButton.click();
  const response = await responsePromise;
  const data = await response.json();

  const thumbRes = await page.request.get(data.thumbnail_url);
  expect(thumbRes.ok()).toBe(true);
});
