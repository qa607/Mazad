import { defineConfig, devices } from '@playwright/test';
import { envConfig, headless, isCI } from './config/env.config';
import type { LanguageOptions } from './src/fixtures/test.fixture';
import { LANGUAGES } from './src/locales';
import type { Language } from './src/types';

// On failure Playwright writes the page's accessibility tree to error-context.md in the report.
// That tree includes input values and on-screen account details (such as the signed-in phone
// number), so it is turned off to keep credentials out of reports.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

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

  // One project per language: every spec runs once in English and once in Arabic.
  projects: (Object.keys(LANGUAGES) as Language[]).map((language) => ({
    name: language,
    use: {
      ...devices['Desktop Chrome'],
      language,
      locale: LANGUAGES[language].locale,
    },
  })),
});
