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

  // Wait for all uploads to complete — preview grid shows 3 success links
  await expect(uploadPage.successCardLinks()).toHaveCount(3);

  // Each card links to a media page
  const hrefs = await uploadPage.successCardLinks().evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/media\//);
  }
});

e2eTest('result thumbnails link to media pages', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  await expect(uploadPage.successCardLinks()).toHaveCount(2);

  // Success cards have target="_blank" so verify href values instead of clicking
  const hrefs = await uploadPage.successCardLinks().evaluateAll(
    (els) => els.map((el) => el.getAttribute('href')),
  );
  for (const href of hrefs) {
    expect(href).toMatch(/^\/media\//);
  }

  // Verify the links open in new tabs
  const targets = await uploadPage.successCardLinks().evaluateAll(
    (els) => els.map((el) => el.getAttribute('target')),
  );
  for (const target of targets) {
    expect(target).toBe('_blank');
  }
});

e2eTest('shows error for failed upload with retry button', async ({ uploadPage, page }) => {
  // Fail the second upload request
  let requestCount = 0;
  await page.route('**/api/media/upload', (route) => {
    requestCount++;
    if (requestCount === 2) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    } else {
      route.continue();
    }
  });

  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  // Wait for both to settle
  await expect(uploadPage.fileCards).toHaveCount(2);
  // One succeeds (has a link), one fails (has retry button)
  await expect(uploadPage.successCardLinks()).toHaveCount(1);
  await expect(page.getByTestId('retry-button')).toBeVisible();
});

e2eTest('retry recovers failed upload', async ({ uploadPage, page }) => {
  let requestCount = 0;
  await page.route('**/api/media/upload', (route) => {
    requestCount++;
    if (requestCount === 2) {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    } else {
      route.continue();
    }
  });

  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  // Wait for failure card
  await expect(page.getByTestId('retry-button')).toBeVisible();

  // Remove route intercept so retry succeeds
  await page.unroute('**/api/media/upload');

  await page.getByTestId('retry-button').click();

  // Both should now be successful
  await expect(uploadPage.successCardLinks()).toHaveCount(2);
});

e2eTest('single file upload shows success card with link', async ({ uploadPage, page }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg']);
  await uploadPage.submitButton.click();

  // Wait for the success card to appear
  await expect(uploadPage.successCardLinks()).toHaveCount(1);

  // Verify the link points to a media page
  const href = await uploadPage.successCardLinks().first().getAttribute('href');
  expect(href).toMatch(/^\/media\//);

  // Click through to verify navigation (opens in new tab)
  const popupPromise = page.waitForEvent('popup');
  await uploadPage.successCardLinks().first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toMatch(/\/media\//);
  await popup.close();
});
