import { defineConfig, devices } from '@playwright/test'
import { env } from './tests/integration/env'

/**
 * End-to-end tests run the real app (Vite on port 5204) against the LOCAL Supabase stack, using a
 * dedicated test business and users on @coaststay.test that are created before and deleted after
 * the run (tests/e2e/global-setup.ts). They refuse to run against non-local Supabase URLs.
 */
const PORT = 5204

if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(env.url).hostname)) {
  throw new Error('E2E tests only run against a local Supabase stack.')
}

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-KE',
    timezoneId: 'Africa/Nairobi',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    // Always the local stack, whatever .env.local points at (process env beats .env files in Vite).
    env: {
      VITE_APP_URL: `http://localhost:${PORT}`,
      VITE_SUPABASE_URL: env.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: env.publishableKey,
    },
  },
})
