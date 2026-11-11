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
/** Cross-system specs (back office, app API, ERP). Not tied to a UI language. */
const INTEGRATION_SPECS = '**/integration/**/*.spec.ts';
/** Native app specs, driven through Appium; the app language is switched inside the specs. */
const MOBILE_SPECS = '**/mobile/**/*.spec.ts';
/** Native app specs that also check the back office, after backend-setup (Dev Root session). */
const MOBILE_BACKOFFICE_SPECS = '**/mobile/**/*.backoffice.spec.ts';
/** Signs in once per run and saves the session (see config/credentials.config.ts). */
const BACKEND_SETUP = '**/backend/**/*.setup.ts';
/**
 * Website specs that also check the back office (tests/frontend): every language on Desktop
 * Chrome and on a phone (Pixel 7), after backend-setup has saved the Dev Root session.
 */
const FRONTEND_SPECS = '**/frontend/**/*.spec.ts';
const FRONTEND_DEVICES = {
  desktop: { device: devices['Desktop Chrome'], grepInvert: /@mobile-only/ },
  mobile: { device: devices['Pixel 7'], grepInvert: /@desktop-only/ },
} as const;

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
    // SLOW_MO=<ms> pauses before every browser action, to watch a headed run step by step.
    launchOptions: { slowMo: Number(process.env.SLOW_MO) || 0 },
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
      testIgnore: [BACKEND_SPECS, INTEGRATION_SPECS, MOBILE_SPECS, FRONTEND_SPECS],
      use: {
        ...devices['Desktop Chrome'],
        language,
        locale: LANGUAGES[language].locale,
      },
    })),
    // Website + back office: frontend-<language>-<desktop|mobile>.
    ...(Object.keys(LANGUAGES) as Language[]).flatMap((language) =>
      (Object.keys(FRONTEND_DEVICES) as (keyof typeof FRONTEND_DEVICES)[]).map((kind) => ({
        name: `frontend-${language}-${kind}`,
        testMatch: FRONTEND_SPECS,
        dependencies: ['backend-setup'],
        grepInvert: FRONTEND_DEVICES[kind].grepInvert,
        use: {
          ...FRONTEND_DEVICES[kind].device,
          language,
          locale: LANGUAGES[language].locale,
        },
      })),
    ),
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
    // Back office + app API + ERP checks of the same records.
    {
      name: 'integration',
      testMatch: INTEGRATION_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    // Mazad Android app on a device/emulator through Appium (no browser is launched).
    {
      name: 'android',
      testMatch: MOBILE_SPECS,
      testIgnore: MOBILE_BACKOFFICE_SPECS,
      timeout: 120_000,
    },
    // Android app + back office: kept apart so a plain Android run never signs in to the back office.
    {
      name: 'android-backoffice',
      testMatch: MOBILE_BACKOFFICE_SPECS,
      dependencies: ['backend-setup'],
      timeout: 180_000,
    },
  ],
});
