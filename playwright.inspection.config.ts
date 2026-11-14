import { defineConfig, devices } from '@playwright/test';
import { envConfig, headless, isCI } from './config/env.config';

// On failure Playwright writes the page's accessibility tree to error-context.md in the report.
// That tree can include input values and on-screen account details, so it is turned off to keep
// credentials out of reports (same reason as the main playwright.config.ts).
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

/**
 * Mazad Inspection automation module: the Inspection backend (stg-224-inspection, a separate
 * Yii2 application from the main Mazad Backend) and, in a later milestone, the installed
 * Inspection Android application. Separate from playwright.config.ts so the existing Mazad
 * suites are untouched, and so TEST_ENV can select a different environment for this module only
 * (npm run test:inspection:backend sets TEST_ENV=stg-224-inspection regardless of .env).
 *
 * The Inspection Backend has no localization (confirmed 2026-11-11, same convention as the main
 * Backend): its specs run once, with no language project.
 */
export default defineConfig({
  testDir: './tests/inspection',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  // Milestone 1: every spec signs in fresh with the one Admin account; one worker until a
  // reused-session setup and safely-parallel specs are introduced (see tests/backend/auth.setup.ts
  // for the main Backend's equivalent pattern, planned for a later milestone here).
  workers: 1,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/inspection/html', open: 'never' }],
    ['junit', { outputFile: 'reports/inspection/junit.xml' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        environmentInfo: {
          Environment: envConfig.name,
          'Base URL': envConfig.baseURL,
          Module: 'Inspection',
        },
      },
    ],
  ],
  outputDir: 'reports/inspection/test-results',

  use: {
    baseURL: envConfig.baseURL,
    headless,
    launchOptions: { slowMo: Number(process.env.SLOW_MO) || 0 },
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'inspection-backend',
      testMatch: '**/backend/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // The installed Inspection Android app (Appium + UiAutomator2, physical device). No browser
    // is launched; `use` carries no Desktop Chrome device profile, matching the main project's
    // own 'android'/'android-backoffice' projects.
    {
      name: 'inspection-android',
      testMatch: '**/android/**/*.spec.ts',
      timeout: 120_000,
    },
  ],
});
