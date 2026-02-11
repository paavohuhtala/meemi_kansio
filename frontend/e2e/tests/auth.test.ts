import { e2eTest, expect } from '../fixtures.ts';

e2eTest('register first user as admin and see home page', async ({ page, registerPage, navBar }) => {
  await registerPage.register('testadmin', 'password123');

  // Should redirect to home
  await expect(page).toHaveURL('/');
  // Username should appear in the nav
  await expect(page.getByText('testadmin')).toBeVisible();
  // Admin menu item should be available (first user is admin)
  await navBar.openMenu('testadmin');
  await expect(navBar.adminItem).toBeVisible();
});

e2eTest('login with existing user', async ({ page, registerPage, loginPage, navBar }) => {
  // First, register a user
  await registerPage.register('loginuser', 'password123');
  await expect(page).toHaveURL('/');

  // Log out via user menu
  await navBar.logout('loginuser');
  await expect(page).toHaveURL('/login');

  // Log back in
  await loginPage.login('loginuser', 'password123');

  await expect(page).toHaveURL('/');
  await expect(page.getByText('loginuser')).toBeVisible();
});

e2eTest('admin can create invite and second user registers with it', async ({ page, registerPage, navBar, adminPage }) => {
  // Register first user (admin)
  await registerPage.register('admin', 'password123');
  await expect(page).toHaveURL('/');

  // Go to admin page via user menu
  await navBar.goToAdmin('admin');
  await expect(adminPage.heading).toBeVisible();

  const inviteCode = await adminPage.createInvite();

  // Log out via user menu
  await navBar.logout('admin');
  await expect(page).toHaveURL('/login');

  // Register second user with invite code
  await registerPage.register('member', 'password123', inviteCode);

  // Should land on home page
  await expect(page).toHaveURL('/');
  await expect(page.getByText('member')).toBeVisible();

  // Admin menu item should NOT be available for non-admin users
  await navBar.openMenu('member');
  await expect(navBar.adminItem).not.toBeVisible();
});

e2eTest('register without invite code fails when users exist', async ({ page, registerPage, navBar }) => {
  // Register first user
  await registerPage.register('firstuser', 'password123');
  await expect(page).toHaveURL('/');

  // Log out via user menu
  await navBar.logout('firstuser');

  // Try to register without invite code
  await registerPage.register('seconduser', 'password123');

  // Should show error
  await expect(page.getByText('Invite code required')).toBeVisible();
});
