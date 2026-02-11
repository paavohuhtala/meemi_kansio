import { test } from '@playwright/test';
import { serverUrl, resetDatabase } from './helpers.ts';
import { RegisterPage } from './pom/RegisterPage.ts';
import { LoginPage } from './pom/LoginPage.ts';
import { NavBar } from './pom/NavBar.ts';
import { AdminPage } from './pom/AdminPage.ts';
import { UploadPage } from './pom/UploadPage.ts';
import { MediaPage } from './pom/MediaPage.ts';
import { BrowsePage } from './pom/BrowsePage.ts';

interface E2EFixtures {
  registerPage: RegisterPage;
  loginPage: LoginPage;
  navBar: NavBar;
  adminPage: AdminPage;
  uploadPage: UploadPage;
  mediaPage: MediaPage;
  browsePage: BrowsePage;
}

export const e2eTest = test.extend<E2EFixtures>({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use) => {
    await use(serverUrl());
  },
  page: async ({ page }, use) => {
    await use(page);
    await resetDatabase();
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  navBar: async ({ page }, use) => {
    await use(new NavBar(page));
  },
  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },
  uploadPage: async ({ page }, use) => {
    await use(new UploadPage(page));
  },
  mediaPage: async ({ page }, use) => {
    await use(new MediaPage(page));
  },
  browsePage: async ({ page }, use) => {
    await use(new BrowsePage(page));
  },
});

export { expect } from '@playwright/test';
