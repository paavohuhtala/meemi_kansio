import { test } from '@playwright/test';
import { serverUrl, resetDatabase } from './helpers.ts';

export const e2eTest = test.extend({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(serverUrl());
  },
  page: async ({ page }, use) => {
      await use(page);
      await resetDatabase();
  },
});

export { expect } from '@playwright/test';
