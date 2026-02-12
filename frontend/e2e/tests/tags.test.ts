import { e2eTest, expect } from '../fixtures.ts';

e2eTest.describe('tagging', () => {
  e2eTest.beforeEach(async ({ page, registerPage }) => {
    await registerPage.register('tagger', 'password123');
    await page.waitForURL('/');
  });

  e2eTest('add tags on detail page', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg');
    await page.waitForURL(/\/media\//);

    await mediaPage.editTags({ add: ['funny', 'classic'] });

    await expect(mediaPage.tagEditor).toBeVisible();
    const chips = mediaPage.tagChips;
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('classic');
    await expect(chips.nth(1)).toContainText('funny');
  });

  e2eTest('edit tags on detail page', async ({ page, uploadPage, mediaPage }) => {
    await uploadPage.upload('sokerivarasto.jpg');
    await page.waitForURL(/\/media\//);

    await mediaPage.editTags({ add: ['original'] });
    await mediaPage.editTags({ remove: ['original'], add: ['updated', 'new-tag'] });

    await expect(mediaPage.tagChips).toHaveCount(2);
    await expect(mediaPage.tagChips.nth(0)).toContainText('new-tag');
    await expect(mediaPage.tagChips.nth(1)).toContainText('updated');
  });

  e2eTest('cancel tag edit reverts changes', async ({ page, uploadPage, mediaPage }) => {
    await uploadPage.upload('sokerivarasto.jpg');
    await page.waitForURL(/\/media\//);

    await mediaPage.editTags({ add: ['keep-me'] });

    await mediaPage.removeTag('keep-me');
    await expect(mediaPage.removedTagChips).toHaveCount(1);
    await mediaPage.cancelTagEdit();

    await expect(mediaPage.tagChips).toHaveCount(1);
    await expect(mediaPage.tagChips.nth(0)).toContainText('keep-me');
  });

  e2eTest('upload without tags shows add tag button', async ({
    page,
    uploadPage,
    mediaPage,
  }) => {
    await uploadPage.upload('sokerivarasto.jpg');
    await page.waitForURL(/\/media\//);

    await expect(mediaPage.tagChips).toHaveCount(0);
    await expect(mediaPage.addTagButton).toBeVisible();
  });
});

e2eTest.describe('tag filtering', () => {
  e2eTest.beforeEach(async ({ page, registerPage, uploadPage, mediaPage }) => {
    await registerPage.register('filterer', 'password123');
    await page.waitForURL('/');

    // Upload media and add tags on detail page
    await uploadPage.upload('sokerivarasto.jpg');
    await page.waitForURL(/\/media\//);
    await mediaPage.editTags({ add: ['cats', 'funny'] });
    await expect(mediaPage.saveTagsButton).not.toBeVisible();

    await uploadPage.upload('markus.png');
    await page.waitForURL(/\/media\//);
    await mediaPage.editTags({ add: ['dogs', 'funny'] });
    await expect(mediaPage.saveTagsButton).not.toBeVisible();

    await uploadPage.upload('questionable_ethics.gif');
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
    await expect(browsePage.gridItems).toHaveCount(2);
    await browsePage.filterByTag('cats');
    await expect(page).toHaveURL(/tags=funny.*cats|tags=cats.*funny/);
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
