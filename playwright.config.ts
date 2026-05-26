import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  testMatch: '**/*e2e*.test.ts',
  fullyParallel: false, // FedCM tests should run sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for FedCM tests
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60000, // 60 second timeout for e2e tests

  use: {
    baseURL: 'http://localhost:6090',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // FedCM dialogs require headed mode
				channel: 'chromium',
        // FedCM requires specific browser flags and headed mode
        launchOptions: {
					executablePath: "/nix/store/l8m1bcirbv61drkic86d117gknr8ls9x-google-chrome-dev-148.0.7743.0/bin/google-chrome-unstable",
          args: [
            //'--flag-switches-begin',
						'--enable-features=FedCmIdPRegistration,FedCmLightweightMode'
            // '--disable-features=FedCmCooldown',
 						//'--flag-switches-end'
          ],
        },
      },
    },
  ],
});
