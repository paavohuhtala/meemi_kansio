import { test } from '@playwright/test';
import { serverUrl, resetDatabase } from './helpers.ts';

export const e2eTest = test.extend({
  baseURL: async ({}, use) => {
    await use(serverUrl());
  },
  _autoReset: [
    async ({}, use) => {
      await use(undefined);
      await resetDatabase();
    },
    { auto: true, scope: 'test' },
  ],
});

export { expect } from '@playwright/test';
