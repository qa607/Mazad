import { defineConfig, devices } from '@playwright/test';
import { envConfig } from './config/env.config';
import type { LanguageOptions } from './src/fixtures/test.fixture';
import { assertStagingTarget } from './ui-tests/support/ui-run';

/**
 * Mazad iOS functional tests (tests-ios/; Appium + XCUITest). Primary target: the simulator
 * UI-test build behind the request guard (IOS_TARGET=simulator); the physical iPhone is a backup.
 * Separate from playwright.config.ts so the existing web/Android setup is untouched.
 * Every test is skipped until the iOS safety gates pass (src/mobile/ios/ios-preflight.ts and
 * the account-action switches in src/mobile/ios/ios.session.ts).
 */
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

// Staging only: the back-office account lookup uses this target too. Refuses any other env/host.
assertStagingTarget(envConfig.baseURL, envConfig.name);

export default defineConfig<LanguageOptions>({
  testDir: './tests-ios',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/ios/html', open: 'never' }],
    ['junit', { outputFile: 'reports/ios/junit.xml' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        environmentInfo: {
          Environment: envConfig.name,
          'Base URL': envConfig.baseURL,
          Platform: 'iOS (XCUITest)',
        },
      },
    ],
  ],
  outputDir: 'reports/ios/test-results',
  // baseURL: the read-only API calls the specs make for expected values (GET /v1/faq-list) and the
  // back-office sign-in below; envConfig only ever holds the approved staging origin.
  use: { trace: 'off', screenshot: 'off', video: 'off', baseURL: envConfig.baseURL },
  projects: [
    {
      name: 'ios',
      testMatch: '**/*.spec.ts',
      testIgnore: '**/*.backoffice.spec.ts',
      use: { language: 'en' },
    },
    // Guest app checks of records the back office creates (as Dev Root) and deletes after each
    // test: it signs in once first (tests/backend/auth.setup.ts, the same step as the main config).
    {
      name: 'ios-backend-setup',
      testDir: './tests/backend',
      testMatch: '**/*.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'ios-backoffice',
      testMatch: '**/*.backoffice.spec.ts',
      dependencies: ['ios-backend-setup'],
      use: { language: 'en' },
    },
    // First guest-screen inspection (records selectors and text; no typing, no submission).
    // Present only when requested explicitly: IOS_INSPECT=true (npm run test:ios:inspect).
    ...(process.env.IOS_INSPECT === 'true'
      ? [{ name: 'ios-inspect', testMatch: '**/*.inspect.ts', use: { language: 'en' as const } }]
      : []),
    // Masked, read-only report of dealer account candidates in the staging back office (a Dev
    // Root login; GET-only afterwards). Present only when requested: IOS_ACCOUNT_REPORT=true.
    ...(process.env.IOS_ACCOUNT_REPORT === 'true'
      ? [
          {
            name: 'ios-account-report',
            testMatch: '**/*.report.ts',
            use: { language: 'en' as const, headless: false },
          },
        ]
      : []),
    // Guarded launch (one launch behind the request guard; no UI interaction). Present only when
    // requested explicitly: IOS_GUARDED_LAUNCH=true (npm run ios:guarded-launch).
    ...(process.env.IOS_GUARDED_LAUNCH === 'true'
      ? [
          {
            name: 'ios-guarded-launch',
            testMatch: '**/*.launch.ts',
            use: { language: 'en' as const },
          },
        ]
      : []),
  ],
});
