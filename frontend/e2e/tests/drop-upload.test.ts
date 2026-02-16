import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { e2eTest, expect } from '../fixtures.ts';

const TEST_DATA_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test_data',
  'memes',
);

e2eTest.describe('drag-drop and paste upload', () => {
  e2eTest.beforeEach(async ({ page, registerPage }) => {
    await registerPage.register('dropper', 'password123');
    await page.waitForURL('/');
  });

  e2eTest(
    'shows drag overlay when dragging file over browse page',
    async ({ browsePage, page }) => {
      await browsePage.goto();

      // Wait for the page content to be rendered and effects settled
      await browsePage.emptyState.waitFor({ state: 'visible' });

      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([''], 'test.jpg', { type: 'image/jpeg' }));
        const event = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        document.dispatchEvent(event);
      });

      await expect(page.getByTestId('drag-overlay')).toBeVisible();
    },
  );

  e2eTest(
    'dropping file on browse page navigates to upload with preview',
    async ({ browsePage, uploadPage, page }) => {
      await browsePage.goto();
      await browsePage.emptyState.waitFor({ state: 'visible' });

      const fileBuffer = await readFile(
        path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
      );

      await page.evaluate((data) => {
        const arr = new Uint8Array(data);
        const file = new File([arr], 'sokerivarasto.jpg', {
          type: 'image/jpeg',
        });
        const dt = new DataTransfer();
        dt.items.add(file);
        const event = new DragEvent('drop', {
          bubbles: true,
          dataTransfer: dt,
        });
        document.dispatchEvent(event);
      }, Array.from(fileBuffer));

      await expect(page).toHaveURL('/upload');
      await expect(uploadPage.fileCards.first()).toBeVisible();
    },
  );

  e2eTest(
    'pasting file on browse page navigates to upload with preview',
    async ({ browsePage, uploadPage, page }) => {
      await browsePage.goto();
      await browsePage.emptyState.waitFor({ state: 'visible' });

      const fileBuffer = await readFile(
        path.join(TEST_DATA_DIR, 'sokerivarasto.jpg'),
      );

      await page.evaluate((data) => {
        const arr = new Uint8Array(data);
        const file = new File([arr], 'sokerivarasto.jpg', {
          type: 'image/jpeg',
        });
        const dt = new DataTransfer();
        dt.items.add(file);

        // ClipboardEvent constructor may not support clipboardData option,
        // so we use defineProperty as a fallback
        const event = new ClipboardEvent('paste', { bubbles: true });
        Object.defineProperty(event, 'clipboardData', { value: dt });
        document.dispatchEvent(event);
      }, Array.from(fileBuffer));

      await expect(page).toHaveURL('/upload');
      await expect(uploadPage.fileCards.first()).toBeVisible();
    },
  );

  e2eTest(
    'dropping multiple files on browse page navigates to upload with all files',
    async ({ browsePage, uploadPage, page }) => {
      await browsePage.goto();
      await browsePage.emptyState.waitFor({ state: 'visible' });

      const { readFile } = await import('node:fs/promises');
      const { resolve } = await import('node:path');
      const testDir = resolve(import.meta.dirname, '..', '..', '..', 'test_data', 'memes');

      const jpg = await readFile(resolve(testDir, 'sokerivarasto.jpg'));
      const png = await readFile(resolve(testDir, 'markus.png'));

      await page.evaluate(([jpgData, pngData]) => {
        const file1 = new File([new Uint8Array(jpgData)], 'sokerivarasto.jpg', { type: 'image/jpeg' });
        const file2 = new File([new Uint8Array(pngData)], 'markus.png', { type: 'image/png' });
        const dt = new DataTransfer();
        dt.items.add(file1);
        dt.items.add(file2);
        document.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
      }, [Array.from(jpg), Array.from(png)]);

      await expect(page).toHaveURL('/upload');
      await expect(uploadPage.fileCards).toHaveCount(2);
    },
  );
});
