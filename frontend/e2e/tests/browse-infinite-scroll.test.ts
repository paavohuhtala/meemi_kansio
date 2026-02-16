import { e2eTest, expect } from '../fixtures.ts';
import { seedMedia } from '../helpers.ts';

const SEED_COUNT = 25;
const PAGE_SIZE = 20;

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('scroller', 'password123');
  await page.waitForURL('/');
});

e2eTest('loads first page then loads more on scroll', async ({ page, browsePage }) => {
  await seedMedia(page.request, SEED_COUNT);
  await browsePage.goto();

  // First page should show PAGE_SIZE items
  await expect(browsePage.gridItems).toHaveCount(PAGE_SIZE);

  // Items are in newest-first order (item-001 is newest)
  const firstPageNames = await browsePage.cardNames().allTextContents();
  expect(firstPageNames[0]).toBe('item-001');
  expect(firstPageNames[PAGE_SIZE - 1]).toBe('item-020');

  // Scroll to trigger infinite scroll
  await browsePage.scrollToLoadMore();

  // All items should now be present
  await expect(browsePage.gridItems).toHaveCount(SEED_COUNT);

  // Verify ordering is preserved across pages
  const allNames = await browsePage.cardNames().allTextContents();
  expect(allNames[0]).toBe('item-001');
  expect(allNames[PAGE_SIZE - 1]).toBe('item-020');
  expect(allNames[SEED_COUNT - 1]).toBe('item-025');
});
