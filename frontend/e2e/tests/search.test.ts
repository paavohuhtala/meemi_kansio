import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ registerPage, page }) => {
  await registerPage.register('searcher', 'password123');
  await page.waitForURL('/');
});

e2eTest('search input is visible on browse page', async ({
  uploadPage,
  browsePage,
  page,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await browsePage.goto();

  await expect(browsePage.searchInput).toBeVisible();
});

e2eTest('search filters results by name', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('sugar warehouse');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('markus face');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('sugar');
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=sugar/);
});

e2eTest('search filters results by description', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editDescription('a funny meme about cats');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editDescription('a picture of a dog');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('cats');
  await expect(browsePage.gridItems).toHaveCount(1);
});

e2eTest('search combines with type filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('test item');

  await uploadPage.upload('kitten_horn.mp4');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('test item');

  await browsePage.goto();
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.search('test');
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.typeFilterPictures.click();
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=test/);
  await expect(page).toHaveURL(/type=image/);
});

e2eTest('search combines with tag filter', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  // Upload image with name + tag
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('findme item');
  await mediaPage.editTags({ add: ['funny'] });

  // Upload image with same name, no tag
  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('findme other');

  await browsePage.goto();
  await browsePage.search('findme');
  await expect(browsePage.gridItems).toHaveCount(2);

  await browsePage.filterByTag('funny');
  await expect(browsePage.gridItems).toHaveCount(1);
});

e2eTest('search persists in URL on page reload', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('persistent search test');

  await browsePage.goto();
  await browsePage.search('persistent');
  await expect(browsePage.gridItems).toHaveCount(1);

  await page.reload();
  await expect(browsePage.searchInput).toHaveValue('persistent');
  await expect(browsePage.gridItems).toHaveCount(1);
  await expect(page).toHaveURL(/search=persistent/);
});

e2eTest('clearing search shows all results', async ({
  page,
  uploadPage,
  mediaPage,
  browsePage,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('alpha item');

  await uploadPage.upload('markus.png');
  await page.waitForURL(/\/media\//);
  await mediaPage.editTitle('beta item');

  await browsePage.goto();
  await browsePage.search('alpha');
  await expect(browsePage.gridItems).toHaveCount(1);

  await browsePage.clearSearch();
  await expect(browsePage.gridItems).toHaveCount(2);
  await expect(page).not.toHaveURL(/search=/);
});

e2eTest('no results shows empty state', async ({
  uploadPage,
  browsePage,
  page,
}) => {
  await uploadPage.upload('sokerivarasto.jpg');
  await page.waitForURL(/\/media\//);

  await browsePage.goto();
  await browsePage.search('nonexistent');
  await expect(browsePage.noMatchText).toBeVisible();
});
