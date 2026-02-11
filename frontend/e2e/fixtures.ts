import { test } from '@playwright/test';
import { serverUrl, resetDatabase } from './helpers.ts';

export const e2eTest = test.extend({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(serverUrl());
  },
  _autoReset: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(undefined);
      await resetDatabase();
    },
    { auto: true, scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
