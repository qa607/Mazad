import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import {
  type ApprovedRequest,
  classifyRequest,
  installGuestGuard,
  type NetworkEvent,
} from '../../src/network/request-guard';
import {
  activeWebRequests,
  APPROVED_WEB_REQUESTS,
  type WebApprovedRequest,
} from '../../src/network/web-approved-requests';
import { expect, test } from '../support/fixtures';

/** Offline selfchecks for the Web functional request guard (local servers only). */
const STAGING = 'staging.selfcheck.invalid';
const RULE = { format: 'json' as const, fields: { phone: ['0509999999'] } };
const LOGIN: ApprovedRequest = {
  method: 'POST',
  pathPrefix: '/api/v1/login',
  operation: 'login attempt',
};

test.describe('Web functional request guard (selfcheck)', () => {
  test('only the Contact Us submit is approved: every other website POST is blocked', () => {
    expect(APPROVED_WEB_REQUESTS.map((r) => `${r.method} ${r.pathPrefix}`)).toEqual([
      'POST /api/v1/contact-form/submit',
    ]);
    const approved = activeWebRequests(APPROVED_WEB_REQUESTS);
    for (const path of ['/api/v1/login', '/api/v1/forgot-password', '/api/v1/contact-form']) {
      expect(
        classifyRequest('POST', `https://${STAGING}${path}`, STAGING, approved),
        path,
      ).toMatchObject({
        action: 'block',
        kind: 'unexpected',
      });
    }
  });

  test('the Contact Us submit passes only with the synthetic QA-AUTO values', () => {
    const approved = activeWebRequests(APPROVED_WEB_REQUESTS);
    const url = `https://${STAGING}/api/v1/contact-form/submit`;
    const form = 'application/x-www-form-urlencoded';
    const body = (values: Record<string, string>) => new URLSearchParams(values).toString();
    const synthetic = {
      name: 'QA AUTO Contact BCDEFGH',
      email: 'qa.contact.1234567@example.invalid',
      phone: '0509999999',
      message: 'QA-AUTO Contact Us message 1234567. Automated test, please ignore.',
    };
    expect(
      classifyRequest('POST', url, STAGING, approved, {
        contentType: form,
        postData: body(synthetic),
      }),
    ).toEqual({ action: 'allow' });

    for (const [field, value] of [
      ['name', 'Real Person'],
      ['email', 'someone@motory.com'],
      ['email', 'qa.contact.1234567@example.invalid.evil.com'],
      ['phone', '0551234567'],
      ['message', 'Hello'],
    ] as const) {
      const verdict = classifyRequest('POST', url, STAGING, approved, {
        contentType: form,
        postData: body({ ...synthetic, [field]: value }),
      });
      expect(verdict, `${field}`).toMatchObject({ action: 'block', kind: 'unexpected' });
      expect(JSON.stringify(verdict)).not.toContain(value);
    }
  });

  test('a loose pattern in a rule is refused', () => {
    for (const pattern of [/qa\.contact/, /^qa$/g, /^qa$/m]) {
      const list: WebApprovedRequest[] = [
        { ...LOGIN, approval: 'test', body: { format: 'form', fields: { email: [pattern] } } },
      ];
      expect(() => activeWebRequests(list), String(pattern)).toThrow(/must be anchored/);
    }
  });

  test('an approved endpoint allows only its exact method, the staging host and https', () => {
    const v = (method: string, url: string) => classifyRequest(method, url, STAGING, [LOGIN]);
    expect(v('POST', `https://${STAGING}/api/v1/login`)).toEqual({ action: 'allow' });
    expect(v('POST', `https://${STAGING}/api/v1/login/extra`)).toEqual({ action: 'allow' });
    for (const [method, url] of [
      ['PUT', `https://${STAGING}/api/v1/login`],
      ['POST', `https://${STAGING}/api/v1/reset-password`],
      ['POST', `https://other.selfcheck.invalid/api/v1/login`],
      ['POST', `http://${STAGING}/api/v1/login`],
    ]) {
      expect(v(method, url), `${method} ${url}`).toMatchObject({
        action: 'block',
        kind: 'unexpected',
      });
    }
  });

  test('paths with server-side effects stay blocked even if listed', () => {
    const approved: ApprovedRequest[] = [
      { method: 'POST', pathPrefix: '/api/v1/log-device', operation: 'should never be allowed' },
    ];
    expect(
      classifyRequest('POST', `https://${STAGING}/api/v1/log-device`, STAGING, approved),
    ).toMatchObject({ action: 'block', kind: 'unexpected' });
  });

  test('endpoints needing a blocked approval switch are not active', () => {
    const list: WebApprovedRequest[] = [
      { ...LOGIN, approval: 'test', body: RULE },
      {
        method: 'POST',
        pathPrefix: '/api/v1/otp',
        operation: 'OTP request',
        requires: 'otp-request',
        approval: 'test',
        body: RULE,
      },
    ];
    const blocked = { 'otp-request': 'blocked', 'password-reset': 'blocked', logout: 'blocked' };
    expect(activeWebRequests(list, blocked).map((r) => r.pathPrefix)).toEqual(['/api/v1/login']);
    const open = { 'otp-request': undefined, 'password-reset': 'blocked', logout: 'blocked' };
    expect(activeWebRequests(list, open)).toHaveLength(2);
  });

  test('in a real browser: approved POST passes, others never reach the server', async ({
    browser,
  }) => {
    const dir = test.info().outputPath('tls');
    fs.mkdirSync(dir, { recursive: true });
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-keyout',
        path.join(dir, 'key.pem'),
        '-out',
        path.join(dir, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    const hits: string[] = [];
    const server = https.createServer(
      {
        key: fs.readFileSync(path.join(dir, 'key.pem')),
        cert: fs.readFileSync(path.join(dir, 'cert.pem')),
      },
      (req, res) => {
        hits.push(`${req.method} ${req.url}`);
        if (req.url === '/api/v1/login-redirect') {
          res.writeHead(302, { Location: '/elsewhere' });
          return res.end();
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<p>ok</p>');
      },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const events: NetworkEvent[] = [];
    await installGuestGuard(context, host, (e) => events.push(e), undefined, [LOGIN]);
    const page = await context.newPage();
    await page.goto(`https://${host}/`);
    const post = (p: string) =>
      page.evaluate(
        (url) =>
          fetch(url, { method: 'POST', body: 'x' }).then(
            (r) => r.status,
            () => -1,
          ),
        p,
      );

    expect(await post('/api/v1/login')).toBe(200);
    expect(await post('/api/v1/reset-password')).toBe(-1);
    expect(await post('/api/v1/login-redirect')).toBe(-1);
    await context.close();
    server.close();

    expect(hits).toContain('POST /api/v1/login');
    expect(hits).not.toContain('POST /api/v1/reset-password');
    expect(hits).not.toContain('GET /elsewhere');
    const unexpected = events.filter((e) => e.kind === 'unexpected').map((e) => e.reason);
    expect(unexpected).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/not allowed/),
        'POST answered with a redirect',
      ]),
    );
  });
});
