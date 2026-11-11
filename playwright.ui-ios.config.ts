import path from 'node:path';
import { defineConfig, type PlaywrightTestOptions, type Project } from '@playwright/test';
import { envConfig } from './config/env.config';
import type { UiOptions } from './ui-tests/support/fixtures';
import { assertStagingTarget, resolveUiRun } from './ui-tests/support/ui-run';

/**
 * iOS UI/visual layer (Login and Forgot Password, guest only), separate from the web UI config.
 * Same modes, snapshot guard and manual approval as web (VISUAL_MODE=check|capture|noise).
 * Device: QA's iPhone by UDID (src/mobile/ios/ios.config.ts). Every test is skipped until the
 * iOS safety gates pass.
 */
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
const run = resolveUiRun(process.env, __dirname);
assertStagingTarget(envConfig.baseURL, envConfig.name);

const projects: Project<PlaywrightTestOptions & UiOptions>[] = (['en', 'ar'] as const).map(
  (language) => ({
    name: `ios-${language}-iphone15plus`,
    testMatch: 'ios/**/*.ios.ui.spec.ts',
    use: { language },
  }),
);

export default defineConfig<UiOptions>({
  testDir: './ui-tests',
  // Device and language are in the project name, so no platform segment is needed.
  snapshotPathTemplate: '{snapshotDir}/{projectName}/{arg}{ext}',
  snapshotDir: run.snapshotDir,
  updateSnapshots: run.updateSnapshots,
  ignoreSnapshots: false,
  outputDir: path.join(run.reportDir, 'test-results'),
  globalSetup: './ui-tests/support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(run.reportDir, 'html'), open: 'never' }],
    ['json', { outputFile: path.join(run.reportDir, 'results.json') }],
    [
      'allure-playwright',
      {
        resultsDir: path.join(run.reportDir, 'allure-results'),
        environmentInfo: { Environment: envConfig.name, Platform: 'iOS', 'Run id': run.runId },
      },
    ],
    ['./ui-tests/support/ui-guard-reporter.ts'],
  ],
  use: { headless: true, serviceWorkers: 'block', trace: 'off', screenshot: 'off', video: 'off' },
  projects,
});
