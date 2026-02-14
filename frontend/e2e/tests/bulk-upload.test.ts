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
  await expect(uploadPage.resultCards).toHaveCount(2);
  // One succeeds (has a link), one fails (has retry button)
  await expect(uploadPage.resultCardLinks()).toHaveCount(1);
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
  await expect(uploadPage.resultCardLinks()).toHaveCount(2);
});

e2eTest('upload more resets to selection', async ({ uploadPage }) => {
  await uploadPage.goto();
  await uploadPage.selectFiles(['sokerivarasto.jpg', 'markus.png']);
  await uploadPage.submitButton.click();

  await expect(uploadPage.resultCardLinks()).toHaveCount(2);
  await uploadPage.uploadMoreButton.click();

  // Back to selection: drop zone visible, no results grid
  await expect(uploadPage.dropZone).toBeVisible();
  await expect(uploadPage.resultsGrid).not.toBeVisible();
});

e2eTest('single file upload still navigates to media page', async ({ uploadPage, page, mediaPage }) => {
  await uploadPage.upload('sokerivarasto.jpg');

  await expect(page).toHaveURL(/\/media\//);
  await expect(mediaPage.image).toBeVisible();
});
