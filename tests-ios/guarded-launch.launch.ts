import fs from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { envConfig } from '@config/env.config';
// No fixture is requested below, so none of the gated iOS fixtures (session, accounts) runs.
import { expect, test } from '@fixtures/ios.fixture';
import { type GuardedLaunchEvidence, runGuardedLaunch } from '@mobile/ios/guarded-launch';
import { realGuardedLaunchDeps } from '@mobile/ios/guarded-launch.runner';

/**
 * Guarded launch (project ios-guarded-launch; only with IOS_GUARDED_LAUNCH=true, via
 * `npm run ios:guarded-launch`). One launch of the simulator UI-test build behind the request
 * guard, no UI interaction, then app and session closed. Evidence:
 * reports/ios-guard/launch-<time>.json (+ .png). Changes no flag; see src/mobile/ios/guarded-launch.ts.
 */
const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-guard');

/** Writes and attaches the evidence (JSON, plus the screenshot when one was taken). */
async function saveEvidence(result: GuardedLaunchEvidence, testInfo: TestInfo): Promise<string> {
  const { screenshot, ...evidence } = result;
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `launch-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  await testInfo.attach('guarded-launch.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
  if (screenshot) {
    fs.writeFileSync(file.replace(/\.json$/, '.png'), Buffer.from(screenshot, 'base64'));
    await testInfo.attach('screen after launch', {
      body: Buffer.from(screenshot, 'base64'),
      contentType: 'image/png',
    });
  }
  return file;
}

test('guarded launch of the simulator UI-test build', async ({}, testInfo) => {
  test.setTimeout(420_000);
  const result = await runGuardedLaunch(process.env, realGuardedLaunchDeps(envConfig.appiumURL));
  const file = await saveEvidence(result, testInfo);
  expect(result.verdict, `${result.reasons.join('\n')}\nEvidence: ${file}`).toBe('pass');
});
