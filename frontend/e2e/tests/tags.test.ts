import { e2eTest, expect } from '../fixtures.ts';

e2eTest.describe('tagging', () => {
  e2eTest.beforeEach(async ({ page, registerPage }) => {
    await registerPage.register('tagger', 'password123');
    await page.waitForURL('/');
  });

  e2eTest('upload with tags shows them on detail page', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg', {
      name: 'Tagged Upload',
      tags: ['funny', 'classic'],
    });
    await page.waitForURL(/\/media\//);

    await expect(mediaPage.tagList).toBeVisible();
    const chips = mediaPage.tagChips;
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('classic');
    await expect(chips.nth(1)).toContainText('funny');
  });

  e2eTest('edit tags on detail page', async ({ page, uploadPage, mediaPage }) => {
    await uploadPage.upload('sokerivarasto.jpg', {
      name: 'Edit Tags',
      tags: ['original'],
    });
    await page.waitForURL(/\/media\//);

    // Remove existing tag
    const removeButton = page.getByLabel('Remove original');
    await removeButton.click();

    // Add new tags via the always-visible TagInput
    await mediaPage.tagInput.fill('updated');
    await mediaPage.tagInput.press('Enter');
    await mediaPage.tagInput.fill('new-tag');
    await mediaPage.tagInput.press('Enter');

    // Tags auto-save, verify they're there
    const chips = mediaPage.tagChips;
    await expect(chips).toHaveCount(2);
  });

  e2eTest('upload without tags shows no tag list', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg', { name: 'No Tags' });
    await page.waitForURL(/\/media\//);

    await expect(mediaPage.tagChips).toHaveCount(0);
  });
});

e2eTest.describe('tag filtering', () => {
  e2eTest.beforeEach(async ({ page, registerPage, uploadPage }) => {
    await registerPage.register('filterer', 'password123');
    await page.waitForURL('/');

    // Upload media with different tags
    await uploadPage.upload('sokerivarasto.jpg', {
      name: 'Cat Meme',
      tags: ['cats', 'funny'],
    });
    await page.waitForURL(/\/media\//);

    await uploadPage.upload('markus.png', {
      name: 'Dog Meme',
      tags: ['dogs', 'funny'],
    });
    await page.waitForURL(/\/media\//);

    await uploadPage.upload('questionable_ethics.gif', {
      name: 'Untagged Gif',
    });
    await page.waitForURL(/\/media\//);
  });

  e2eTest('filter by tag shows matching items', async ({ browsePage }) => {
    await browsePage.goto();
    await expect(browsePage.gridItems).toHaveCount(3);

    await browsePage.filterByTag('cats');
    await expect(browsePage.gridItems).toHaveCount(1);
  });

  e2eTest('filter by shared tag shows multiple items', async ({ browsePage }) => {
    await browsePage.goto();

    await browsePage.filterByTag('funny');
    await expect(browsePage.gridItems).toHaveCount(2);
  });

  e2eTest('multi-tag filter uses AND logic', async ({ page, browsePage }) => {
    await browsePage.goto();

    await browsePage.filterByTag('funny');
    await expect(page).toHaveURL(/tags=funny/);
    await browsePage.filterByTag('cats');
    await expect(browsePage.gridItems).toHaveCount(1);
  });

  e2eTest('non-matching filter shows empty state', async ({ browsePage }) => {
    await browsePage.goto();

    await browsePage.filterByTag('nonexistent');
    await expect(browsePage.noMatchText).toBeVisible();
  });

  e2eTest('clicking card tag activates filter', async ({ page, browsePage }) => {
    await browsePage.goto();

    // Find any card tag on the page (some cards may be untagged)
    const anyTag = page.getByTestId('card-tag').first();
    const tagText = await anyTag.textContent();
    await anyTag.click();

    // URL should include the tag
    await expect(page).toHaveURL(new RegExp(`tags=${tagText}`));
  });

  e2eTest('tag filter is reflected in URL', async ({ page, browsePage }) => {
    await browsePage.goto();

    await browsePage.filterByTag('cats');
    await expect(page).toHaveURL(/tags=cats/);
  });

});
