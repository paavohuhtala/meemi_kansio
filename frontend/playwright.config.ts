import { defineConfig, devices } from '@playwright/test';
import { HEALTH_CHECK_PORT } from './e2e/helpers.ts';

const WORKERS = 4;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: WORKERS,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `TEST_INSTANCES=${WORKERS} node e2e/test-server.ts`,
    url: `http://localhost:${HEALTH_CHECK_PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
});
