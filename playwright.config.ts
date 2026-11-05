import { defineConfig, devices } from '@playwright/test';
import { envConfig, headless, isCI } from './config/env.config';
import type { LanguageOptions } from './src/fixtures/test.fixture';
import { LANGUAGES } from './src/locales';
import type { Language } from './src/types';

// On failure Playwright writes the page's accessibility tree to error-context.md in the report.
// That tree includes input values and on-screen account details (such as the signed-in phone
// number), so it is turned off to keep credentials out of reports.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

/** Mazad Backend (back office) specs. The Backend has no localization. */
const BACKEND_SPECS = '**/backend/**/*.spec.ts';
/** Signs in once per run and saves the session (see config/credentials.config.ts). */
const BACKEND_SETUP = '**/backend/**/*.setup.ts';

export default defineConfig<LanguageOptions>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 2,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        environmentInfo: {
          Environment: envConfig.name,
          'Base URL': envConfig.baseURL,
          Node: process.version,
        },
      },
    ],
  ],

  use: {
    baseURL: envConfig.baseURL,
    headless,
    // Mazad serves the Saudi market only.
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Customer website: one project per language, so every spec runs in English and in Arabic.
    ...(Object.keys(LANGUAGES) as Language[]).map((language) => ({
      name: language,
      testIgnore: BACKEND_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        language,
        locale: LANGUAGES[language].locale,
      },
    })),
    // Back office: signs in as Dev Root once per run; signed-in specs reuse that session.
    {
      name: 'backend-setup',
      testMatch: BACKEND_SETUP,
      use: { ...devices['Desktop Chrome'] },
    },
    // Back office: no localization, so its specs run once, with no language settings.
    {
      name: 'backend',
      testMatch: BACKEND_SPECS,
      dependencies: ['backend-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
