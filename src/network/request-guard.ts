import type { APIResponse, BrowserContext, Request, Route } from '@playwright/test';
import { type BodyRule, bodyRuleProblem, type BodySummary, summarizeBody } from './request-body';

/**
 * Request guard shared by the UI layer (guest-only) and the Web functional tests.
 * The functional tests may pass a list of approved non-GET staging endpoints; the UI layer
 * passes none. Formerly ui-tests/support/guest-guard.ts (which now re-exports this module).
 *
 * Guest network guard. Installed on the browser CONTEXT before any navigation,
 * so it also covers popups and new pages. It fails closed:
 *
 * - allow:      GET/HEAD to the staging host, the listed static, font and cookie-banner hosts,
 *               and the listed S3 image paths (https only). Redirect hops are checked too.
 * - expected:   known guest traffic that is blocked and logged (analytics, Firebase sign-up and
 *               tokens, Firestore). The run continues.
 * - unexpected: everything else: any GET/HEAD to an unlisted host, any other method, any request
 *               to a path with server-side effects, and any WebSocket. Blocked and logged; the
 *               test fails and the whole run is halted.
 */

export type GuardKind = 'expected' | 'unexpected' | 'allowed-exception';

export interface NetworkEvent {
  kind: GuardKind;
  method: string;
  /** Host and path only; query strings are dropped so tokens never reach reports. */
  target: string;
  reason: string;
  page?: string;
  /** For blocked non-GET requests: the body's structure only (field names, types, synthetic match). */
  body?: BodySummary;
}

/**
 * A non-GET staging endpoint the QA owner approved (functional tests only): exact method,
 * the staging host, and a path prefix. Requests to SIDE_EFFECT_PATHS are never approvable.
 */
export interface ApprovedRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pathPrefix: string;
  /** What the request does, for reports (for example "login attempt", "OTP request"). */
  operation: string;
  /** Required body shape and synthetic values. Checked before the request is sent. */
  body?: BodyRule;
}

/** A request body as seen in the route handler, before sending. */
export interface RequestBody {
  contentType?: string;
  postData?: string | null;
}

export type RequestVerdict =
  { action: 'allow' } | { action: 'block'; kind: GuardKind; reason: string };

/** Third-party hosts whose GETs the guest pages need (fonts, static files, cookie banner). */
export const ALLOWED_GET_HOSTS: readonly string[] = [
  'www.gstatic.com',
  'www.google.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'content.jwplatform.com',
  'cdn-prod.eu.securiti.ai',
  'app.eu.securiti.ai',
];

/**
 * Images on S3 (path-style URLs on one host). Allowed only for GET/HEAD over https on exactly
 * this host, and only under these path prefixes. Every other S3 host or path stays unexpected.
 */
export const S3_IMAGE_HOST = 's3.eu-central-1.amazonaws.com';
export const S3_IMAGE_PATH_PREFIXES: readonly string[] = [
  // Car photos (car details page).
  '/app-auctions.motory.com/',
  // Make logos and supplier images on /auctions/ (seen in capture step3-capture-2).
  '/v3-auction-common.motory.com/makes/',
  '/v3-auction-common.motory.com/supplier-profile/',
];

/** Redirect chains longer than this are treated as unexpected. */
export const MAX_REDIRECTS = 10;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Google's API loader, requested by the login page with a phone browser identity (seen in
 * capture step3-capture-3). Blocked as expected (logged, no halt) only for GET over https to
 * exactly this host and path; any other path or method on this host is unexpected.
 */
export const EXPECTED_BLOCKED_SCRIPT = { host: 'apis.google.com', path: '/js/api.js' } as const;

/**
 * The ONE Firebase endpoint the Web registration spec may allow through, and nothing else on
 * Firebase: creating an anonymous auth session, which the registration UI needs to render step 2
 * onward (confirmed 2026-11-10; staging project `mazad-v3`, not shared with production). This is
 * never enabled by default: only `installGuestGuard`'s `allowFirebaseAnonymousSignup` flag, set by
 * the registration spec's own fixture option, can turn it on. Every other Firebase/Firestore path,
 * and every Mazad account-creation endpoint, stays blocked exactly as before.
 */
export const FIREBASE_ANONYMOUS_SIGNUP = {
  host: 'identitytoolkit.googleapis.com',
  path: '/v1/accounts:signUp',
  method: 'POST',
} as const;

/** Blocked for every method; seen on every guest page load, so blocking them is expected. */
export const EXPECTED_BLOCKED_DOMAINS: readonly string[] = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firestore.googleapis.com',
];

/** Staging API paths with server-side effects, even as GET. Any request to them halts the run. */
export const SIDE_EFFECT_PATHS: readonly string[] = [
  '/api/v1/custom-token/',
  '/api/v1/generate-device-id',
  '/api/v1/log-device',
];

const READ_METHODS = new Set(['GET', 'HEAD']);

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Whether a request is exactly the one Firebase call the registration spec may allow. */
export function isFirebaseAnonymousSignupRequest(method: string, url: URL): boolean {
  return (
    method === FIREBASE_ANONYMOUS_SIGNUP.method &&
    url.protocol === 'https:' &&
    url.host === FIREBASE_ANONYMOUS_SIGNUP.host &&
    url.pathname === FIREBASE_ANONYMOUS_SIGNUP.path
  );
}

export function describeTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return rawUrl.slice(0, 120);
  }
}

export function classifyRequest(
  method: string,
  rawUrl: string,
  stagingHost: string,
  approved: readonly ApprovedRequest[] = [],
  body: RequestBody = {},
  /** Off by default everywhere; only the Web registration spec's fixture option turns it on. */
  allowFirebaseAnonymousSignup = false,
): RequestVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { action: 'block', kind: 'unexpected', reason: 'unparseable URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // data:, blob: and similar never leave the browser.
    return READ_METHODS.has(method)
      ? { action: 'allow' }
      : { action: 'block', kind: 'unexpected', reason: `${method} on ${url.protocol}` };
  }
  const host = url.host;
  if (SIDE_EFFECT_PATHS.some((p) => url.pathname.startsWith(p))) {
    return { action: 'block', kind: 'unexpected', reason: 'path with server-side effects' };
  }
  if (
    method === 'GET' &&
    url.protocol === 'https:' &&
    url.host === EXPECTED_BLOCKED_SCRIPT.host &&
    url.pathname === EXPECTED_BLOCKED_SCRIPT.path
  ) {
    return { action: 'block', kind: 'expected', reason: 'Google API loader (guest guard)' };
  }
  if (allowFirebaseAnonymousSignup && isFirebaseAnonymousSignupRequest(method, url)) {
    return { action: 'allow' };
  }
  if (EXPECTED_BLOCKED_DOMAINS.some((d) => hostMatches(url.hostname, d))) {
    return { action: 'block', kind: 'expected', reason: 'analytics/Firebase (guest guard)' };
  }
  const entry =
    !READ_METHODS.has(method) && url.protocol === 'https:' && host === stagingHost
      ? approved.find((a) => a.method === method && url.pathname.startsWith(a.pathPrefix))
      : undefined;
  if (entry) {
    const problem = entry.body
      ? bodyRuleProblem(entry.body, body.contentType, body.postData)
      : undefined;
    if (problem) {
      return { action: 'block', kind: 'unexpected', reason: `${method} body rejected: ${problem}` };
    }
    return { action: 'allow' };
  }
  if (!READ_METHODS.has(method)) {
    return { action: 'block', kind: 'unexpected', reason: `${method} is not allowed for guests` };
  }
  if (host === stagingHost || ALLOWED_GET_HOSTS.includes(url.hostname)) return { action: 'allow' };
  // url.pathname is already normalized ("..", "%2e%2e"), so the prefix cannot be escaped.
  if (
    url.protocol === 'https:' &&
    url.host === S3_IMAGE_HOST &&
    S3_IMAGE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return { action: 'allow' };
  }
  return {
    action: 'block',
    kind: 'unexpected',
    reason: `${method} to a host not on the allowlist`,
  };
}

function framePage(request: Request): string | undefined {
  try {
    return describeTarget(request.frame().url());
  } catch {
    return undefined; // Service-worker or detached-frame requests have no frame.
  }
}

/**
 * Installs the guard on a context. Every blocked request and WebSocket is reported to onEvent.
 *
 * Redirects: Playwright calls a route handler only for the FIRST URL of a redirect chain, so
 * passing allowed requests straight through would let a redirect reach any host. Instead, each
 * allowed request is fetched here with redirects off, and every hop of a redirect chain is
 * classified (and fetched, still with redirects off) before the browser sees any of it:
 * - any hop that is not allowed: the request is aborted and reported as unexpected (halt);
 * - subresources: the browser receives the final response directly, so it follows no redirect;
 * - navigations: the browser receives the original redirect and follows the verified chain.
 * A request listener reports any redirect hop that still reaches a non-allowed target.
 */
/** An allowed redirect chain (logging only; it never changes what is allowed or blocked). */
export interface RedirectRecord {
  from: string;
  /** Every hop, in order, as status and target (host and path only). */
  hops: { status: number; to: string }[];
  /** True for navigations: the browser follows the verified chain, so each hop is fetched twice. */
  navigation: boolean;
}

export async function installGuestGuard(
  context: BrowserContext,
  stagingHost: string,
  onEvent: (event: NetworkEvent) => void,
  onRedirect?: (record: RedirectRecord) => void,
  approved: readonly ApprovedRequest[] = [],
  /** Synthetic test values, by name, flagged (never shown) in body summaries. */
  synthetic: Readonly<Record<string, string>> = {},
  /** Off by default; only the Web registration spec's fixture option turns this on. */
  allowFirebaseAnonymousSignup = false,
  /**
   * Called once, only for the allowed Firebase anonymous-signup exception, with the uid and ID
   * token FROM ITS RESPONSE, and the Firebase Web API key FROM THE REQUEST (not a secret: Firebase
   * Web API keys only identify the project and are always visible in client-side traffic) — held
   * in memory for the caller's own cleanup (accounts:delete). The ID token must not be logged or
   * attached to a report; this module never does so itself via onEvent.
   */
  onFirebaseSignup?: (result: { localId: string; idToken: string; apiKey: string }) => void,
): Promise<void> {
  const block = async (route: Route, kind: GuardKind, target: string, reason: string) => {
    const request = route.request();
    const body = READ_METHODS.has(request.method())
      ? undefined
      : summarizeBody(request.headers()['content-type'], request.postData(), synthetic);
    onEvent({ kind, method: request.method(), target, reason, page: framePage(request), body });
    await route.abort('blockedbyclient');
  };

  await context.route('**/*', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    // The body is inspected here, in the route handler, before anything is sent.
    const verdict = classifyRequest(
      method,
      url,
      stagingHost,
      approved,
      { contentType: request.headers()['content-type'], postData: request.postData() },
      allowFirebaseAnonymousSignup,
    );
    if (verdict.action !== 'allow') {
      await block(route, verdict.kind, describeTarget(url), verdict.reason);
      return;
    }
    let parsedUrl: URL | undefined;
    try {
      parsedUrl = new URL(url);
    } catch {
      /* already classified above; only used below to recognise the Firebase exception */
    }
    const isFirebaseSignup =
      allowFirebaseAnonymousSignup &&
      parsedUrl !== undefined &&
      isFirebaseAnonymousSignupRequest(method, parsedUrl);
    if (isFirebaseSignup) {
      // Audit trail only: method and host+path (no query string, so the API key never appears
      // here), and the request body's field names/types only (never values) — no ID token, no
      // response content. This is the one place a Firebase request is logged despite being allowed.
      onEvent({
        kind: 'allowed-exception',
        method,
        target: describeTarget(url),
        reason: 'Firebase anonymous signup (registration spec exception)',
        page: framePage(request),
        body: summarizeBody(request.headers()['content-type'], request.postData(), synthetic),
      });
    }
    if (!/^https?:/.test(url)) {
      await route.fallback(); // data:, blob: never leave the browser.
      return;
    }

    let first: APIResponse;
    try {
      first = await route.fetch({ maxRedirects: 0 });
    } catch {
      await route.abort('failed');
      return;
    }
    if (isFirebaseSignup && onFirebaseSignup && first.ok()) {
      // Read-only: the real response the app itself receives is unaffected (route.fulfill below
      // still sends the original APIResponse). Never logged, never attached to a report.
      try {
        const parsed: unknown = await first.json();
        const localId = (parsed as { localId?: unknown })?.localId;
        const idToken = (parsed as { idToken?: unknown })?.idToken;
        const apiKey = parsedUrl?.searchParams.get('key');
        if (typeof localId === 'string' && typeof idToken === 'string' && apiKey) {
          onFirebaseSignup({ localId, idToken, apiKey });
        }
      } catch {
        /* Unexpected response shape: cleanup simply has nothing to clean up. */
      }
    }
    let hop = first;
    let hopUrl = request.url();
    const hops: RedirectRecord['hops'] = [];
    // An approved non-GET request is never allowed to redirect: replaying its body to another
    // URL is not something the approval covers.
    if (!READ_METHODS.has(method) && REDIRECT_STATUSES.has(first.status())) {
      await block(
        route,
        'unexpected',
        describeTarget(request.url()),
        `${method} answered with a redirect`,
      );
      return;
    }
    for (let n = 0; REDIRECT_STATUSES.has(hop.status()); n++) {
      const location = hop.headers()['location'];
      if (!location || n >= MAX_REDIRECTS) {
        await block(
          route,
          'unexpected',
          describeTarget(hopUrl),
          'redirect without target, or too many redirects',
        );
        return;
      }
      const next = new URL(location, hopUrl).toString();
      const nextVerdict = classifyRequest(method, next, stagingHost);
      if (nextVerdict.action !== 'allow') {
        await block(
          route,
          'unexpected',
          describeTarget(next),
          `redirect from ${describeTarget(hopUrl)}: ${nextVerdict.reason}`,
        );
        return;
      }
      hops.push({ status: hop.status(), to: describeTarget(next) });
      hopUrl = next;
      try {
        hop = await route.fetch({ url: next, maxRedirects: 0 });
      } catch {
        await route.abort('failed');
        return;
      }
    }
    if (hops.length) {
      onRedirect?.({
        from: describeTarget(request.url()),
        hops,
        navigation: request.isNavigationRequest(),
      });
    }
    await route.fulfill({ response: request.isNavigationRequest() ? first : hop });
  });

  // Backstop: report any redirect hop the browser sent to a target that is not allowed.
  context.on('request', (request) => {
    if (!request.redirectedFrom()) return;
    const verdict = classifyRequest(request.method(), request.url(), stagingHost);
    if (verdict.action === 'allow') return;
    onEvent({
      kind: 'unexpected',
      method: request.method(),
      target: describeTarget(request.url()),
      reason: `redirect hop reached a target that is not allowed: ${verdict.reason}`,
      page: framePage(request),
    });
  });

  await context.routeWebSocket(/.*/, async (ws) => {
    onEvent({
      kind: 'unexpected',
      method: 'WEBSOCKET',
      target: describeTarget(ws.url()),
      reason: 'WebSockets are not expected on guest pages',
    });
    // No connectToServer(): the socket never reaches the server.
    await ws.close({ code: 1008, reason: 'Blocked by the UI guest guard' });
  });
}
