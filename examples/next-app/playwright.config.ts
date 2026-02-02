import { defineConfig, devices } from '@playwright/test';
import path from 'path';

// Load environment variables from .env file
import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '.env') });

/**
 * Playwright configuration for @humeai/voice-react SDK e2e tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? 'github' : 'html',
  /* Global timeout for each test */
  timeout: 60 * 1000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3003',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3003',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      // Pass credentials to the dev server
      HUME_API_KEY: process.env.HUME_API_KEY || '',
      HUME_SECRET_KEY: process.env.HUME_SECRET_KEY || '',
      TEST_HUME_API_KEY: process.env.TEST_HUME_API_KEY || '',
      TEST_HUME_SECRET_KEY: process.env.TEST_HUME_SECRET_KEY || '',
      HUME_CONFIG_ID: process.env.HUME_CONFIG_ID || '',
      NEXT_PUBLIC_HUME_VOICE_HOSTNAME: process.env.NEXT_PUBLIC_HUME_VOICE_HOSTNAME || 'api.hume.ai',
    },
  },
});
