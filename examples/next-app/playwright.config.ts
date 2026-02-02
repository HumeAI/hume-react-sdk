import { defineConfig, devices } from '@playwright/test';
import path from 'path';

import { config } from 'dotenv';
config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60 * 1000,
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3003',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // Pass credentials: .env (local) or CI secrets (TEST_HUME_*). Page uses HUME_* ?? TEST_HUME_*.
    env: {
      HUME_API_KEY:
        process.env.HUME_API_KEY ?? process.env.TEST_HUME_API_KEY ?? '',
      HUME_SECRET_KEY:
        process.env.HUME_SECRET_KEY ?? process.env.TEST_HUME_SECRET_KEY ?? '',
      TEST_HUME_API_KEY: process.env.TEST_HUME_API_KEY ?? '',
      TEST_HUME_SECRET_KEY: process.env.TEST_HUME_SECRET_KEY ?? '',
      HUME_CONFIG_ID: process.env.HUME_CONFIG_ID ?? '',
      NEXT_PUBLIC_HUME_VOICE_HOSTNAME:
        process.env.NEXT_PUBLIC_HUME_VOICE_HOSTNAME ?? 'api.hume.ai',
    },
  },
});
