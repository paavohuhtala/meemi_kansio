import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ registerPage, page }) => {
  await registerPage.register('filterer', 'password123');
  await page.waitForURL('/');
});

e2eTest('type filter buttons are visible on browse page', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();

  await expect(browsePage.typeFilterAll).toBeVisible();
  await expect(browsePage.typeFilterPictures).toBeVisible();
  await expect(browsePage.typeFilterGifs).toBeVisible();
  await expect(browsePage.typeFilterVideos).toBeVisible();
});

e2eTest('filter by pictures shows only images', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=image/);
});

e2eTest('filter by videos shows only videos', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=video/);
});

e2eTest('filter by GIFs shows only GIFs', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('questionable_ethics.gif');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterGifs.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=gif/);
});

e2eTest('All filter shows everything', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);

  await browsePage.typeFilterAll.click();
  await expect(browsePage.gridItems).toHaveCount(2);
  await expect(page).not.toHaveURL(/type=/);
});

e2eTest('type filter persists in URL on page reload', async ({
  page,
  uploadPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.typeFilterVideos.click();
  await expect(browsePage.gridItems).toHaveCount(1);

  await page.reload();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=video/);
});

e2eTest('type filter combines with tag filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  // Upload image with tag
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTags({ add: ['funny'] });

  // Upload video with same tag
  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTags({ add: ['funny'] });

  // Upload image without tag
  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(3);

  // Filter by tag only
  await browsePage.filterByTag('funny');
  await expect(browsePage.gridItems).toHaveCount(2);

  // Filter by tag + type
  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/type=image/);
  await expect(page).toHaveURL(/tags=funny/);
});
