import path from 'node:path';
import { envConfig } from '@config/env.config';
import { createMitmGuardProxy } from '../../network/mitm-guard-proxy';
import type { NetworkEvent } from '../../network/request-guard';
import { ensureTestCa } from '../../network/test-ca';
import { WEB_SYNTHETIC_VALUES } from '../../network/web-approved-requests';
import type { IosConfig } from '@mobile/ios/ios.config';

/** Where the simulator-only test CA lives (gitignored: reports/). */
export const IOS_TEST_CA_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'reports',
  'ios-guard',
  'ca',
);

/** The only backend host: the selected approved staging environment's host (TEST_ENV). */
export const IOS_STAGING_HOST = new URL(envConfig.baseURL).host;

export interface IosGuard {
  /** Blocked requests (expected and unexpected), in order. */
  events: NetworkEvent[];
  /** Allowed requests (method, host, path): the runtime evidence of the backend the app uses. */
  allowed: { method: string; target: string }[];
  readonly halted: boolean;
  close(): Promise<void>;
}

/**
 * Starts the request guard for a simulator run, before any session: every request of the
 * UI-test build goes through it (method, host, path and body checked before forwarding).
 * No iOS endpoint is approved: every non-GET request is blocked and halts the run.
 */
export async function startIosGuard(config: IosConfig): Promise<IosGuard> {
  if (config.target !== 'simulator' || !config.guardProxy) {
    throw new Error('The iOS request guard is for the simulator UI-test build only.');
  }
  const events: NetworkEvent[] = [];
  const allowed: { method: string; target: string }[] = [];
  const proxy = createMitmGuardProxy({
    ca: ensureTestCa(IOS_TEST_CA_DIR),
    stagingHost: IOS_STAGING_HOST,
    approved: [],
    synthetic: WEB_SYNTHETIC_VALUES,
    onEvent: (e) => events.push(e),
    onAllowed: (e) => allowed.push(e),
  });
  await proxy.listen(config.guardProxy.port, config.guardProxy.host);
  return {
    events,
    allowed,
    get halted() {
      return proxy.halted;
    },
    close: () => proxy.close(),
  };
}

/**
 * Runtime backend check: the app must have called the staging host, and no allowed request may
 * have gone to a host other than staging or the listed static/image hosts (which the guard
 * already enforces). Returns a problem, or undefined.
 */
export function backendEvidenceProblem(guard: IosGuard): string | undefined {
  const toStaging = guard.allowed.filter((a) => a.target.startsWith(`${IOS_STAGING_HOST}/`));
  if (!toStaging.length) {
    return `No request to the staging host ${IOS_STAGING_HOST} was seen: the app's backend is not verified.`;
  }
  return undefined;
}
