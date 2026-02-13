import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('browser', 'password123');
  await page.waitForURL('/');
});

e2eTest('empty state shows message with upload link', async ({ browsePage }) => {
  await browsePage.goto();

  await expect(browsePage.emptyState).toBeVisible();
  await expect(browsePage.uploadLink).toBeVisible();
});

e2eTest('uploaded items appear in the grid', async ({ page, uploadPage, browsePage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  await expect(browsePage.gridItems).toHaveCount(2);
  await expect(browsePage.gridImages()).toHaveCount(2);
});

e2eTest('clicking a grid item navigates to detail page', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.gridItems.first().click();

  await expect(page).toHaveURL(/\/media\//);
});

e2eTest('grid shows video with play icon', async ({ page, uploadPage, browsePage }) => {
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  await expect(browsePage.gridVideos()).toHaveCount(1);
});

e2eTest('gallery images use thumbnail URLs', async ({ page, uploadPage, browsePage }) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  const imgSrc = await browsePage.gridImages().first().getAttribute('src');
  expect(imgSrc).toContain('_thumb.webp');
});
