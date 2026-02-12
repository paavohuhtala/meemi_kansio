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
    await expect(mediaPage.tagChips).toHaveCount(2);
    await expect(mediaPage.tagChips.nth(0)).toHaveText('classic');
    await expect(mediaPage.tagChips.nth(1)).toHaveText('funny');
  });

  e2eTest('edit tags on detail page', async ({ page, uploadPage, mediaPage }) => {
    await uploadPage.upload('sokerivarasto.jpg', {
      name: 'Edit Tags',
      tags: ['original'],
    });
    await page.waitForURL(/\/media\//);

    // Enter edit mode
    await mediaPage.editButton.click();

    // Remove existing tag and add new ones
    const removeButton = page.getByLabel('Remove original');
    await removeButton.click();

    const tagField = page.getByTestId('tag-input-field');
    await tagField.fill('updated');
    await tagField.press('Enter');
    await tagField.fill('new-tag');
    await tagField.press('Enter');

    await mediaPage.saveEdit.click();

    // Verify updated tags
    await expect(mediaPage.tagChips).toHaveCount(2);
    await expect(mediaPage.tagChips.nth(0)).toHaveText('new-tag');
    await expect(mediaPage.tagChips.nth(1)).toHaveText('updated');
  });

  e2eTest('upload without tags shows no tag list', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg', { name: 'No Tags' });
    await page.waitForURL(/\/media\//);

    await expect(mediaPage.tagList).toHaveCount(0);
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

  e2eTest('tag chip on detail page links to filtered browse', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg', {
      name: 'Link Test',
      tags: ['linkable'],
    });
    await page.waitForURL(/\/media\//);

    await mediaPage.tagChips.first().click();
    await expect(page).toHaveURL(/\/\?tags=linkable/);
  });
});
