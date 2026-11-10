import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
import { Findings } from './findings';
import {
  describeTarget,
  installGuestGuard,
  type NetworkEvent,
  type RedirectRecord,
} from './guest-guard';
import { assertStagingTarget, resolveUiRun, snapshotSettingsProblem, type UiRun } from './ui-run';

/** Options set per project in playwright.ui.config.ts. */
export interface UiOptions {
  language: 'en' | 'ar';
  /** True for the phone-emulated viewports (390, 360). */
  phone: boolean;
}

interface UiTestFixtures {
  /** Requests the guest guard blocked in this test (auto: the guard is always installed). */
  networkLog: NetworkEvent[];
  /** Layout and localization findings for this test; attached to the report at the end. */
  findings: Findings;
  _haltCheck: void;
}

interface UiWorkerFixtures {
  uiRun: UiRun;
  _snapshotGuard: void;
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');

/** A stand-in that throws on any use: the UI layer never calls APIs directly. */
function blockedApi(name: string): APIRequestContext {
  return new Proxy({} as APIRequestContext, {
    get(_target, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      throw new Error(`The '${name}' fixture is blocked in the UI layer (guest-only, read-only).`);
    },
  });
}

function writeHalt(file: string, event: NetworkEvent, testTitle: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, JSON.stringify({ test: testTitle, event }, null, 2), { flag: 'wx' });
  } catch {
    // Already halted by an earlier event; keep the first one.
  }
}

export const test = base.extend<UiOptions & UiTestFixtures, UiWorkerFixtures>({
  language: ['en', { option: true }],
  phone: [false, { option: true }],

  uiRun: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(resolveUiRun(process.env, ROOT_DIR));
    },
    { scope: 'worker' },
  ],

  // Refuses to run when snapshot settings could write baselines outside a capture run.
  _snapshotGuard: [
    async ({ uiRun }, use, workerInfo) => {
      const problem = snapshotSettingsProblem(uiRun, {
        updateSnapshots: workerInfo.config.updateSnapshots,
        snapshotDir: workerInfo.project.snapshotDir,
        ignoreSnapshots: workerInfo.project.ignoreSnapshots,
      });
      if (problem) throw new Error(`Snapshot guard: ${problem}`);
      await use();
    },
    { scope: 'worker', auto: true },
  ],

  // Once an unexpected request has halted the run, every later test fails at once.
  _haltCheck: [
    async ({ uiRun }, use) => {
      if (fs.existsSync(uiRun.haltFile)) {
        throw new Error(
          `Run halted after an unexpected request; see ${path.relative(ROOT_DIR, uiRun.haltFile)}.`,
        );
      }
      await use();
    },
    { auto: true },
  ],

  networkLog: [
    async ({ context, baseURL, uiRun }, use, testInfo) => {
      const events: NetworkEvent[] = [];
      // Web tests: re-check the exact staging target before the browser opens anything.
      if (testInfo.project.name.startsWith('web-')) assertStagingTarget(baseURL);
      const stagingHost = new URL(baseURL ?? 'https://invalid.invalid').host;
      const redirects: RedirectRecord[] = [];
      // Every request the browser sends, counted by method, host and path (no query strings).
      const sent = new Map<string, number>();
      context.on('request', (request) => {
        const key = `${request.method()} ${describeTarget(request.url())}`;
        sent.set(key, (sent.get(key) ?? 0) + 1);
      });
      await installGuestGuard(
        context,
        stagingHost,
        (event) => {
          events.push(event);
          if (event.kind === 'unexpected') writeHalt(uiRun.haltFile, event, testInfo.title);
        },
        (record) => redirects.push(record),
      );

      await use(events);

      if (redirects.length) {
        await testInfo.attach('redirects.json', {
          body: JSON.stringify(redirects, null, 2),
          contentType: 'application/json',
        });
      }
      const duplicates = [...sent]
        .filter(([, n]) => n > 1)
        .map(([request, count]) => ({ request, count }));
      if (duplicates.length) {
        await testInfo.attach('duplicate-requests.json', {
          body: JSON.stringify(duplicates, null, 2),
          contentType: 'application/json',
        });
      }
      if (events.length) {
        await testInfo.attach('network-log.json', {
          body: JSON.stringify(events, null, 2),
          contentType: 'application/json',
        });
      }
      const unexpected = events.filter((e) => e.kind === 'unexpected');
      if (unexpected.length) {
        testInfo.annotations.push({
          type: 'ui-unexpected-request',
          description: unexpected.map((e) => `${e.method} ${e.target}`).join('; '),
        });
        throw new Error(
          `Unexpected request(s) blocked; the run is halted: ` +
            unexpected.map((e) => `${e.method} ${e.target} (${e.reason})`).join('; '),
        );
      }
    },
    { auto: true },
  ],

  findings: async ({ language, viewport }, use, testInfo) => {
    const findings = new Findings(language, viewport ? `${viewport.width}x${viewport.height}` : '');
    await use(findings);
    await findings.attach(testInfo);
    const errors = findings.errors();
    if (errors.length) {
      throw new Error(
        `${errors.length} layout/localization error(s): ` +
          errors.map((f) => `${f.screen} › ${f.component}: ${f.rule}`).join('; '),
      );
    }
  },

  // The UI layer is guest-only: no direct API calls.
  // eslint-disable-next-line no-empty-pattern
  request: async ({}, use) => {
    await use(blockedApi('request'));
  },
});

export { expect };
