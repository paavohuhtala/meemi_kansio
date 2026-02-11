import { e2eTest, expect } from '../fixtures.ts';

e2eTest('register first user as admin and see home page', async ({ page }) => {
  await page.goto('/register');

  await page.getByPlaceholder('Username').fill('testadmin');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Should redirect to home
  await expect(page).toHaveURL('/');
  // Username should appear in the nav
  await expect(page.getByText('testadmin')).toBeVisible();
  // Admin link should be visible (first user is admin)
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
});

e2eTest('login with existing user', async ({ page }) => {
  // First, register a user
  await page.goto('/register');
  await page.getByPlaceholder('Username').fill('loginuser');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');

  // Log out
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  // Log back in
  await page.getByPlaceholder('Username').fill('loginuser');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByText('loginuser')).toBeVisible();
});

e2eTest('admin can create invite and second user registers with it', async ({ page }) => {
  // Register first user (admin)
  await page.goto('/register');
  await page.getByPlaceholder('Username').fill('admin');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');

  // Go to admin page and create invite
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

  await page.getByRole('button', { name: 'New invite' }).click();

  // Wait for the invite to appear in the table
  const codeCell = page.locator('code').first();
  await expect(codeCell).toBeVisible();
  const inviteCode = await codeCell.textContent();
  expect(inviteCode).toBeTruthy();

  // Log out
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/login');

  // Register second user with invite code
  await page.goto('/register');
  await page.getByPlaceholder('Invite code').fill(inviteCode!);
  await page.getByPlaceholder('Username').fill('member');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Should land on home page
  await expect(page).toHaveURL('/');
  await expect(page.getByText('member')).toBeVisible();

  // Admin link should NOT be visible for non-admin users
  await expect(page.getByRole('link', { name: 'Admin' })).not.toBeVisible();
});

e2eTest('register without invite code fails when users exist', async ({ page }) => {
  // Register first user
  await page.goto('/register');
  await page.getByPlaceholder('Username').fill('firstuser');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/');

  // Log out
  await page.getByRole('button', { name: 'Log out' }).click();

  // Try to register without invite code
  await page.goto('/register');
  await page.getByPlaceholder('Username').fill('seconduser');
  await page.getByPlaceholder('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Should show error
  await expect(page.getByText('Invite code required')).toBeVisible();
});
