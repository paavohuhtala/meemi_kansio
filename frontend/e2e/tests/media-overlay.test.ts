import { e2eTest, expect } from '../fixtures.ts';

e2eTest.describe('media overlay', () => {
  e2eTest.beforeEach(async ({ page, registerPage }) => {
    await registerPage.register('overlay-user', 'password123');
    await page.waitForURL('/');
  });

  e2eTest.describe('image', () => {
    e2eTest.beforeEach(async ({ page, uploadPage }) => {
      await uploadPage.upload('sokerivarasto.jpg');
      await page.waitForURL(/\/media\//);
    });

    e2eTest('shows copy and download on browse page', async ({ browsePage }) => {
      await browsePage.goto();
      const card = browsePage.gridItems.first();
      await card.hover();

      await expect(browsePage.cardCopyButton(0)).toBeAttached();
      await expect(browsePage.cardDownloadButton(0)).toBeAttached();
    });

    e2eTest('shows copy and download on media page', async ({ mediaPage }) => {
      await mediaPage.image.hover();

      await expect(mediaPage.copyButton).toBeAttached();
      await expect(mediaPage.downloadButton).toBeAttached();
    });

    e2eTest('download triggers file download from media page', async ({ mediaPage, page }) => {
      const downloadPromise = page.waitForEvent('download');
      await mediaPage.downloadButton.click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/^sokerivarasto\./);

    });

    e2eTest('download on browse page does not navigate away', async ({ page, browsePage }) => {
      await browsePage.goto();

      const downloadPromise = page.waitForEvent('download');
      await browsePage.cardDownloadButton(0).click();
      await downloadPromise;

      await expect(page).toHaveURL('/');
    });
  });

  e2eTest.describe('video', () => {
    e2eTest.beforeEach(async ({ page, uploadPage }) => {
      await uploadPage.upload('kitten_horn.mp4');
      await page.waitForURL(/\/media\//);
    });

    e2eTest('hides copy button on browse page', async ({ browsePage }) => {
      await browsePage.goto();
      await browsePage.gridItems.first().hover();

      await expect(browsePage.cardDownloadButton(0)).toBeAttached();
      await expect(browsePage.cardCopyButton(0)).toHaveCount(0);
    });

    e2eTest('hides copy button on media page', async ({ mediaPage }) => {
      await mediaPage.video.hover();

      await expect(mediaPage.downloadButton).toBeAttached();
      await expect(mediaPage.copyButton).toHaveCount(0);
    });
  });

  e2eTest.describe('gif', () => {
    e2eTest.beforeEach(async ({ page, uploadPage }) => {
      await uploadPage.upload('questionable_ethics.gif');
      await page.waitForURL(/\/media\//);
    });

    e2eTest('hides copy button on browse page', async ({ browsePage }) => {
      await browsePage.goto();
      await browsePage.gridItems.first().hover();

      await expect(browsePage.cardDownloadButton(0)).toBeAttached();
      await expect(browsePage.cardCopyButton(0)).toHaveCount(0);
    });

    e2eTest('hides copy button on media page', async ({ mediaPage }) => {
      await mediaPage.image.hover();

      await expect(mediaPage.downloadButton).toBeAttached();
      await expect(mediaPage.copyButton).toHaveCount(0);
    });
  });
});
