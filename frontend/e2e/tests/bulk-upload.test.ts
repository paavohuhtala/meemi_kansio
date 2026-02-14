import { e2eTest, expect } from '../fixtures.ts';

e2eTest.beforeEach(async ({ page, registerPage }) => {
  await registerPage.register('bulkuploader', 'password123');
  await page.waitForURL('/');
});

e2eTest('bulk upload shows results grid with clickable thumbnails', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png', 'questionable_ethics.gif']);

  await expect(uploadPage.submitButton).toHaveText('Upload 3 files');
  await uploadPage.submitButton.click();

  // Wait for all uploads to complete — results grid appears with 3 cards
  await expect(uploadPage.resultCardLinks()).toHaveCount(3);

  // Each card links to a media page
  const hrefs = await uploadPage.resultCardLinks().evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/media\//);
  }
});

e2eTest('clicking result thumbnail navigates to media page', async ({ uploadPage, page, mediaPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  await expect(uploadPage.resultCardLinks()).toHaveCount(2);

  await uploadPage.resultCardLinks().first().click();
  await expect(page).toHaveURL(/\/media\//);
  await expect(uploadPage.resultsGrid).not.toBeVisible();
  await expect(mediaPage.image).toBeVisible();
});
