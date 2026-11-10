import fs from 'node:fs';
import path from 'node:path';
import {
  defineConfig,
  devices,
  type PlaywrightTestOptions,
  type PlaywrightWorkerOptions,
  type Project,
} from '@playwright/test';
import { envConfig } from './config/env.config';
import type { UiOptions } from './ui-tests/support/fixtures';
import { assertStagingTarget, resolveUiRun } from './ui-tests/support/ui-run';

/**
 * UI design, text-layout and localization layer for the Mazad website (guest pages only).
 * Separate from playwright.config.ts: the functional suite never loads this file.
 *
 * Everything is driven by environment variables, never by CLI flags, because Playwright workers
 * re-read this file without the runner's argv:
 *   VISUAL_MODE      check (default) | capture | noise
 *   VISUAL_RUN_ID    optional run id; generated once by the runner and inherited by the workers
 *   VISUAL_BASE_RUN  noise only: the capture run to compare against
 *   UI_SUITE         web (default) | selfcheck
 */

// Accessibility snapshots in error-context.md can contain on-screen text; keep reports minimal.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

const run = resolveUiRun(process.env, __dirname);

// Staging only: refuses any other environment, host, port or scheme (BASE_URL overrides too).
assertStagingTarget(envConfig.baseURL, envConfig.name);

type UiProject = Project<PlaywrightTestOptions & UiOptions, PlaywrightWorkerOptions>;

/** Viewports approved for Phase 1. Phones get phone emulation; 768 stays a desktop/tablet. */
const VIEWPORTS = [
  { id: '1440', width: 1440, height: 900, phone: false },
  { id: '1280', width: 1280, height: 720, phone: false },
  { id: '768', width: 768, height: 1024, phone: false },
  { id: '390', width: 390, height: 844, phone: true },
  { id: '360', width: 360, height: 800, phone: true },
] as const;

const LANGUAGES = [
  { language: 'en', locale: 'en-SA' },
  { language: 'ar', locale: 'ar-SA' },
] as const;

const webProjects: UiProject[] = LANGUAGES.flatMap(({ language, locale }) =>
  VIEWPORTS.map((vp) => ({
    name: `web-${language}-${vp.id}`,
    // Phase 1 scope: Login and Forgot Password only. The other web specs stay in ui-tests/web/
    // but are excluded from the run.
    testMatch: 'web/login.ui.spec.ts',
    use: {
      ...devices['Desktop Chrome'],
      ...(vp.phone
        ? {
            // Chromium only: an Android Chrome identity with touch, at 3x density.
            userAgent: devices['Pixel 7'].userAgent,
            isMobile: true,
            hasTouch: true,
            deviceScaleFactor: 3,
          }
        : { deviceScaleFactor: 1 }),
      viewport: { width: vp.width, height: vp.height },
      language,
      locale,
      phone: vp.phone,
    },
  })),
);

const selfcheckProject: UiProject = {
  name: 'selfcheck',
  testMatch: 'selfcheck/**/*.spec.ts',
  use: { ...devices['Desktop Chrome'], baseURL: 'https://selfcheck.invalid' },
};

export default defineConfig<UiOptions>({
  testDir: './ui-tests',
  // Screenshots: {snapshotDir}/<project>/<platform>/<name>.png
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{platform}/{arg}{ext}',
  snapshotDir: run.snapshotDir,
  updateSnapshots: run.updateSnapshots,
  ignoreSnapshots: false,
  outputDir: path.join(run.reportDir, 'test-results'),
  globalSetup: './ui-tests/support/global-setup.ts',

  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,

  expect: {
    toHaveScreenshot: {
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(run.reportDir, 'html'), open: 'never' }],
    ['json', { outputFile: path.join(run.reportDir, 'results.json') }],
    [
      'allure-playwright',
      {
        resultsDir: path.join(run.reportDir, 'allure-results'),
        // Only non-secret fields; never spread envConfig or process.env.
        environmentInfo: {
          Environment: envConfig.name,
          Host: new URL(envConfig.baseURL).host,
          'Visual mode': run.mode,
          'Run id': run.runId,
        },
      },
    ],
    ['./ui-tests/support/ui-guard-reporter.ts'],
  ],

  use: {
    baseURL: envConfig.baseURL,
    headless: true,
    timezoneId: 'Asia/Riyadh',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },

  projects: run.suite === 'selfcheck' ? [selfcheckProject] : webProjects,
});

// Fail fast in the runner if a capture would reuse a folder (workers see it already created).
if (!process.env.TEST_WORKER_INDEX && run.mode === 'capture' && fs.existsSync(run.snapshotDir)) {
  throw new Error(
    `Capture run folder already exists: ${run.snapshotDir}. Use a new VISUAL_RUN_ID.`,
  );
}
