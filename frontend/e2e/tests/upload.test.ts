import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('uploader', 'password123');
  await page.waitForURL('/');
});

e2eTest('upload JPG with name and description', async ({ page, uploadPage, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg', {
    name: 'Sokerivarasto',
    description: 'A classic meme',
  });

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
  await expect(mediaPage.title).toHaveText('Sokerivarasto');
  await expect(page.getByText('A classic meme')).toBeVisible();
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

e2eTest('upload unsupported file type shows error', async ({ page, uploadPage }) => {
  await uploadPage.upload('invalid.unknown');

  await expect(page.getByText(/Unsupported file type/)).toBeVisible();
});
