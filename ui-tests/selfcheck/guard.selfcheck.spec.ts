import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '../support/fixtures';
import { classifyRequest, installGuestGuard, type NetworkEvent } from '../support/guest-guard';

/** Local only: requests go to reserved .invalid hosts and are aborted by the guard. */
const STAGING = 'staging.selfcheck.invalid';

test.describe('Guest guard (selfcheck)', () => {
  test('classifies requests', () => {
    const v = (method: string, url: string) => classifyRequest(method, url, STAGING);
    expect(v('GET', `https://${STAGING}/en/`)).toEqual({ action: 'allow' });
    expect(v('HEAD', `https://${STAGING}/x.png`)).toEqual({ action: 'allow' });
    expect(v('GET', 'https://fonts.gstatic.com/s/font.woff2')).toEqual({ action: 'allow' });
    expect(v('POST', `https://${STAGING}/api/v1/anything`)).toMatchObject({ kind: 'unexpected' });
    expect(v('PUT', 'https://fonts.gstatic.com/x')).toMatchObject({ kind: 'unexpected' });
    expect(v('GET', `https://${STAGING}/api/v1/custom-token/abc`)).toMatchObject({
      kind: 'unexpected',
    });
    expect(v('GET', `https://${STAGING}/api/v1/generate-device-id`)).toMatchObject({
      kind: 'unexpected',
    });
    expect(v('POST', `https://${STAGING}/api/v1/log-device`)).toMatchObject({ kind: 'unexpected' });
    expect(v('POST', 'https://identitytoolkit.googleapis.com/v1/accounts:signUp')).toMatchObject({
      kind: 'expected',
    });
    expect(
      v('POST', 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'),
    ).toMatchObject({ kind: 'expected' });
    expect(v('GET', 'https://firestore.googleapis.com/x')).toMatchObject({ kind: 'expected' });
    expect(v('GET', 'https://www.googletagmanager.com/gtm.js')).toMatchObject({ kind: 'expected' });
    expect(v('GET', 'https://region1.google-analytics.com/g/collect')).toMatchObject({
      kind: 'expected',
    });
    expect(v('GET', 'https://unknown.example.invalid/x.js')).toMatchObject({ kind: 'unexpected' });
    expect(v('GET', 'data:image/png;base64,AAAA')).toEqual({ action: 'allow' });
  });

  test('blocks in a real browser context and reports every event', async ({ browser }) => {
    const context = await browser.newContext();
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, STAGING, (e) => events.push(e));
    const page = await context.newPage();
    await page.setContent('<p>selfcheck</p>');
    await page.evaluate(async (staging) => {
      const attempt = (p: Promise<unknown>) =>
        p.then(
          () => undefined,
          () => undefined,
        );
      await attempt(fetch(`https://${staging}/api/v1/thing`, { method: 'POST', body: 'x' }));
      await attempt(fetch('https://www.googletagmanager.com/gtm.js'));
      await attempt(fetch('https://unknown.example.invalid/x.js'));
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(`wss://${staging}/socket`);
        ws.onclose = () => resolve();
        ws.onerror = () => resolve();
        setTimeout(resolve, 3_000);
      });
    }, STAGING);
    await context.close();

    const summary = events.map((e) => `${e.kind} ${e.method} ${e.target}`);
    expect(summary).toEqual(
      expect.arrayContaining([
        `unexpected POST ${STAGING}/api/v1/thing`,
        'expected GET www.googletagmanager.com/gtm.js',
        'unexpected GET unknown.example.invalid/x.js',
        `unexpected WEBSOCKET ${STAGING}/socket`,
      ]),
    );
  });

  test('projects block service workers', () => {
    expect(test.info().project.use.serviceWorkers).toBe('block');
  });

  test('the request fixture is blocked', ({ request }) => {
    expect(() => request.get('/')).toThrow(/blocked in the UI layer/);
  });
});

test.describe('S3 image rule (selfcheck)', () => {
  const v = (method: string, url: string) => classifyRequest(method, url, STAGING);
  const S3 = 'https://s3.eu-central-1.amazonaws.com';
  const ALLOWED = [
    `${S3}/app-auctions.motory.com/2026/Jul/screenshot_1.jpg`,
    `${S3}/v3-auction-common.motory.com/makes/17/3330db337abe5a4548298e4f0e9710bb.png`,
    `${S3}/v3-auction-common.motory.com/supplier-profile/782/548c2f1c65cdc6e28cd5ea88b755639e.png`,
    `${S3}/v3-auction-common.motory.com/faq-category-icon/about_auctions.png`,
  ];

  test('1. allows GET and HEAD to the exact allowed paths', () => {
    for (const url of ALLOWED) {
      expect(v('GET', url), url).toEqual({ action: 'allow' });
      expect(v('HEAD', url), url).toEqual({ action: 'allow' });
    }
  });

  test('2. blocks other paths on the same S3 host', () => {
    for (const url of [
      `${S3}/other-bucket/x.jpg`,
      `${S3}/app-auctions.motory.com.evil/x.jpg`,
      `${S3}/app-auctions.motory.com`,
      `${S3}/app-auctions.motory.com/../other-bucket/x.jpg`,
      `${S3}/app-auctions.motory.com/%2e%2e/other-bucket/x.jpg`,
      `${S3}/`,
      // The second bucket: only makes/, supplier-profile/ and faq-category-icon/ are allowed.
      `${S3}/v3-auction-common.motory.com/faq-category-icon-evil/x.png`,
      `${S3}/v3-auction-common.motory.com/faq-category-icon/../secret/x.png`,
      `${S3}/v3-auction-common.motory.com/`,
      `${S3}/v3-auction-common.motory.com/other/x.png`,
      `${S3}/v3-auction-common.motory.com/makes`,
      `${S3}/v3-auction-common.motory.com/makes-evil/x.png`,
      `${S3}/v3-auction-common.motory.com/supplier-profile-evil/x.png`,
      `${S3}/v3-auction-common.motory.com/makes/../secret/x.png`,
      `${S3}/v3-auction-common.motory.com/makes/%2e%2e/secret/x.png`,
      `${S3}/v3-auction-common.motory.com.evil/makes/x.png`,
    ]) {
      expect(v('GET', url), url).toMatchObject({ action: 'block', kind: 'unexpected' });
    }
  });

  test('3. blocks other S3 hosts and lookalikes', () => {
    for (const path of [
      '/app-auctions.motory.com/x.jpg',
      '/v3-auction-common.motory.com/makes/x.png',
      '/v3-auction-common.motory.com/supplier-profile/x.png',
    ]) {
      for (const url of [
        `https://s3.us-east-1.amazonaws.com${path}`,
        `https://s3.amazonaws.com${path}`,
        `https://s3.eu-central-1.amazonaws.com.evil.invalid${path}`,
        `https://s3.eu-central-1.amazonaws.com:8443${path}`,
        `http://s3.eu-central-1.amazonaws.com${path}`,
      ]) {
        expect(v('GET', url), url).toMatchObject({ action: 'block', kind: 'unexpected' });
      }
    }
    expect(
      v('GET', 'https://app-auctions.motory.com.s3.eu-central-1.amazonaws.com/x.jpg'),
    ).toMatchObject({ action: 'block', kind: 'unexpected' });
  });

  test('4. blocks POST, PUT, DELETE and PATCH to the allowed paths', () => {
    for (const url of ALLOWED) {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        expect(v(method, url), `${method} ${url}`).toMatchObject({
          action: 'block',
          kind: 'unexpected',
        });
      }
    }
  });
});

test.describe('Redirects (selfcheck, two local servers)', () => {
  test('redirect hops are checked and never bypass the allowlist', async ({ browser }) => {
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const otherHits: string[] = [];
    const other = http.createServer((req, res) => {
      otherHits.push(req.url ?? '');
      res.end('other');
    });
    const main = http.createServer((req, res) => {
      const url = req.url ?? '/';
      const redirect = (to: string) => {
        res.writeHead(302, { Location: to });
        res.end();
      };
      const otherBase = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
      if (url.startsWith('/to-other')) return redirect(`${otherBase}/hit${url}`);
      if (url.startsWith('/chain')) return redirect(`/to-other${url}`);
      if (url === '/same-img') return redirect('/final.png');
      if (url.startsWith('/same')) return redirect('/final');
      if (url === '/final.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        return res.end(PNG);
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(url === '/final' ? '<p id="final">final</p>' : '<p>start</p>');
    });
    await new Promise<void>((r) => other.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => main.listen(0, '127.0.0.1', r));
    const mainHost = `127.0.0.1:${(main.address() as AddressInfo).port}`;

    const context = await browser.newContext();
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, mainHost, (e) => events.push(e));
    const page = await context.newPage();
    await page.goto(`http://${mainHost}/`);

    // Allowed redirects (same host) still work for fetch, images and navigation.
    expect(await page.evaluate(() => fetch('/same-fetch').then((r) => r.text()))).toContain(
      'final',
    );
    expect(
      await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth);
            img.onerror = () => resolve(-1);
            img.src = '/same-img';
          }),
      ),
    ).toBe(1);
    await page.goto(`http://${mainHost}/same-nav`);
    await expect(page.locator('#final')).toBeVisible();

    // Redirects to a host that is not allowed: blocked for fetch, image, navigation and chains.
    await page.goto(`http://${mainHost}/`);
    await page.evaluate(() => fetch('/to-other-fetch').catch(() => undefined));
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = '/to-other-img';
        }),
    );
    await page.goto(`http://${mainHost}/to-other-nav`).catch(() => undefined);
    await page.goto(`http://${mainHost}/chain-nav`).catch(() => undefined);
    await context.close();
    main.close();
    other.close();

    expect(otherHits, 'the other server must never be reached').toEqual([]);
    const unexpected = events.filter((e) => e.kind === 'unexpected').map((e) => e.target);
    for (const path of ['to-other-fetch', 'to-other-img', 'to-other-nav', 'chain-nav']) {
      expect(
        unexpected.some((t) => t.includes('/hit/') && t.endsWith(path)),
        path,
      ).toBe(true);
    }
  });
});

test.describe('Google API loader rule (selfcheck)', () => {
  const v = (method: string, url: string) => classifyRequest(method, url, STAGING);
  const LOADER = 'https://apis.google.com/js/api.js';

  test('1. GET to the exact path is an expected block (no halt)', () => {
    expect(v('GET', LOADER)).toMatchObject({ action: 'block', kind: 'expected' });
    expect(v('GET', `${LOADER}?onload=init`)).toMatchObject({ action: 'block', kind: 'expected' });
  });

  test('2. other paths, hosts and schemes on this host are unexpected (halt)', () => {
    for (const url of [
      'https://apis.google.com/js/platform.js',
      'https://apis.google.com/js/api.js/extra',
      'https://apis.google.com/js/',
      'https://apis.google.com/',
      'https://apis.google.com/_/scs/abc/api.js',
      'https://apis.google.com:8443/js/api.js',
      'http://apis.google.com/js/api.js',
      'https://apis.google.com.evil.invalid/js/api.js',
      'https://accounts.google.com/js/api.js',
    ]) {
      expect(v('GET', url), url).toMatchObject({ action: 'block', kind: 'unexpected' });
    }
  });

  test('3. other methods to the exact path are unexpected (halt)', () => {
    for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      expect(v(method, LOADER), method).toMatchObject({ action: 'block', kind: 'unexpected' });
    }
  });

  test('in a real browser: the loader is logged as expected, other paths as unexpected', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, STAGING, (e) => events.push(e));
    const page = await context.newPage();
    await page.setContent('<p>loader</p>');
    await page.evaluate(async () => {
      const attempt = (p: Promise<unknown>) =>
        p.then(
          () => undefined,
          () => undefined,
        );
      await attempt(fetch('https://apis.google.com/js/api.js'));
      await attempt(fetch('https://apis.google.com/js/platform.js'));
      await attempt(fetch('https://apis.google.com/js/api.js', { method: 'POST', body: 'x' }));
    });
    await context.close();
    expect(events.map((e) => `${e.kind} ${e.method} ${e.target}`)).toEqual([
      'expected GET apis.google.com/js/api.js',
      'unexpected GET apis.google.com/js/platform.js',
      'unexpected POST apis.google.com/js/api.js',
    ]);
  });
});
