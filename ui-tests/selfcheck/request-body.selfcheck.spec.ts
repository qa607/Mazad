import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { bodyRuleProblem, type BodyRule, summarizeBody } from '../../src/network/request-body';
import {
  type ApprovedRequest,
  classifyRequest,
  installGuestGuard,
  type NetworkEvent,
} from '../../src/network/request-guard';
import { WEB_SYNTHETIC_VALUES } from '../../src/network/web-approved-requests';
import { expect, test } from '../support/fixtures';

/**
 * Offline selfchecks: POST body inspection and structure-only logging. No staging, no network.
 * Real-looking values below are made up and must never appear in any summary or reason.
 */
const SYNTHETIC_PHONE = WEB_SYNTHETIC_VALUES.unregisteredPhone;
const SYNTHETIC_PASSWORD = WEB_SYNTHETIC_VALUES.wrongPassword;
const REAL_LOOKING_PHONE = '0551234567';
const REAL_LOOKING_PASSWORD = 'Sup3r-Secret!';
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.secret-token';
const JSON_TYPE = 'application/json; charset=utf-8';
const RULE: BodyRule = {
  format: 'json',
  fields: { phone: [SYNTHETIC_PHONE], password: [SYNTHETIC_PASSWORD] },
};
const json = (o: unknown) => JSON.stringify(o);
const RAW = [
  SYNTHETIC_PHONE,
  SYNTHETIC_PASSWORD,
  REAL_LOOKING_PHONE,
  REAL_LOOKING_PASSWORD,
  TOKEN,
  '551234567',
];
const expectNoRawValues = (anything: unknown) => {
  const text = JSON.stringify(anything);
  for (const raw of RAW) expect(text, `must not contain ${raw.slice(0, 3)}…`).not.toContain(raw);
};

test.describe('Request body: structure-only summary (selfcheck)', () => {
  test('lists field names, types and synthetic matches, never values', () => {
    const summary = summarizeBody(
      JSON_TYPE,
      json({
        phone: SYNTHETIC_PHONE,
        password: REAL_LOOKING_PASSWORD,
        device: { token: TOKEN },
        remember: true,
      }),
      WEB_SYNTHETIC_VALUES,
    );
    expect(summary).toEqual({
      format: 'json',
      contentType: 'application/json',
      fields: [
        { name: 'phone', type: 'string', synthetic: 'unregisteredPhone' },
        { name: 'password', type: 'string', synthetic: null },
        { name: 'device', type: 'object', synthetic: null },
        { name: 'device.token', type: 'string', synthetic: null },
        { name: 'remember', type: 'boolean', synthetic: null },
      ],
    });
    expectNoRawValues(summary);
  });

  test('recognises the synthetic phone in another format without showing it', () => {
    const summary = summarizeBody(
      JSON_TYPE,
      json({ mobile: '+966509999999' }),
      WEB_SYNTHETIC_VALUES,
    );
    expect(summary.fields[0]).toEqual({
      name: 'mobile',
      type: 'string',
      synthetic: 'unregisteredPhone (same number, other format)',
    });
    expectNoRawValues(summary);
  });

  test('a real-looking phone is reported as not synthetic, without its value', () => {
    const summary = summarizeBody(
      JSON_TYPE,
      json({ phone: REAL_LOOKING_PHONE }),
      WEB_SYNTHETIC_VALUES,
    );
    expect(summary.fields[0].synthetic).toBeNull();
    expectNoRawValues(summary);
  });

  test('form bodies, malformed JSON, unsupported and empty bodies', () => {
    const form = summarizeBody(
      'application/x-www-form-urlencoded',
      `phone=${SYNTHETIC_PHONE}&password=${encodeURIComponent(REAL_LOOKING_PASSWORD)}`,
      WEB_SYNTHETIC_VALUES,
    );
    expect(form.format).toBe('form');
    expect(form.fields.map((f) => `${f.name}:${f.synthetic}`)).toEqual([
      'phone:unregisteredPhone',
      'password:null',
    ]);
    expectNoRawValues(form);
    const malformed = summarizeBody(JSON_TYPE, `{"phone":"${REAL_LOOKING_PHONE}",`);
    expect(malformed).toEqual({ format: 'malformed', contentType: 'application/json', fields: [] });
    expectNoRawValues(malformed);
    expect(summarizeBody('text/plain', REAL_LOOKING_PASSWORD).format).toBe('unsupported');
    expect(summarizeBody(JSON_TYPE, '').format).toBe('empty');
    expect(summarizeBody(JSON_TYPE, `[${json(REAL_LOOKING_PHONE)}]`).format).toBe('malformed');
  });

  test('value-like field names are redacted', () => {
    const summary = summarizeBody(JSON_TYPE, json({ [REAL_LOOKING_PHONE]: true, [TOKEN]: 1 }));
    expect(summary.fields.map((f) => f.name)).toEqual(['[redacted-name]', '[redacted-name]']);
    expectNoRawValues(summary);
  });
});

test.describe('Request body: approved rule (selfcheck)', () => {
  const problem = (contentType: string, body: string) => bodyRuleProblem(RULE, contentType, body);

  test('the exact synthetic payload matches', () => {
    expect(
      problem(JSON_TYPE, json({ phone: SYNTHETIC_PHONE, password: SYNTHETIC_PASSWORD })),
    ).toBeUndefined();
  });

  test('rejects non-matching, missing, unexpected, malformed and wrong-type bodies (no values in reasons)', () => {
    const cases: [string, string, RegExp][] = [
      [
        JSON_TYPE,
        json({ phone: REAL_LOOKING_PHONE, password: SYNTHETIC_PASSWORD }),
        /field phone is not an approved synthetic value/,
      ],
      [
        JSON_TYPE,
        json({ phone: SYNTHETIC_PHONE, password: REAL_LOOKING_PASSWORD }),
        /field password is not an approved synthetic value/,
      ],
      [JSON_TYPE, json({ phone: SYNTHETIC_PHONE }), /missing field password/],
      [
        JSON_TYPE,
        json({ phone: SYNTHETIC_PHONE, password: SYNTHETIC_PASSWORD, token: TOKEN }),
        /unexpected field token/,
      ],
      [JSON_TYPE, `{"phone":"${SYNTHETIC_PHONE}"`, /body is malformed, not json/],
      [
        'text/plain',
        json({ phone: SYNTHETIC_PHONE, password: SYNTHETIC_PASSWORD }),
        /body is unsupported, not json/,
      ],
      [
        'application/x-www-form-urlencoded',
        `phone=${SYNTHETIC_PHONE}&password=x`,
        /body is form, not json/,
      ],
      [
        JSON_TYPE,
        json({ phone: { value: SYNTHETIC_PHONE }, password: SYNTHETIC_PASSWORD }),
        /nested objects or arrays/,
      ],
      [
        JSON_TYPE,
        json({ phone: true, password: SYNTHETIC_PASSWORD }),
        /field phone is not an approved synthetic value/,
      ],
      [JSON_TYPE, '', /body is empty, not json/],
    ];
    for (const [type, body, expected] of cases) {
      const reason = problem(type, body);
      expect(reason, body.slice(0, 20)).toMatch(expected);
      expectNoRawValues(reason);
    }
  });

  test('the guard applies the rule before allowing an approved endpoint', () => {
    const approved: ApprovedRequest[] = [
      { method: 'POST', pathPrefix: '/api/v1/login', operation: 'login attempt', body: RULE },
    ];
    const url = 'https://staging.selfcheck.invalid/api/v1/login';
    const ok = {
      contentType: JSON_TYPE,
      postData: json({ phone: SYNTHETIC_PHONE, password: SYNTHETIC_PASSWORD }),
    };
    const bad = {
      contentType: JSON_TYPE,
      postData: json({ phone: REAL_LOOKING_PHONE, password: SYNTHETIC_PASSWORD }),
    };
    expect(classifyRequest('POST', url, 'staging.selfcheck.invalid', approved, ok)).toEqual({
      action: 'allow',
    });
    const verdict = classifyRequest('POST', url, 'staging.selfcheck.invalid', approved, bad);
    expect(verdict).toMatchObject({ action: 'block', kind: 'unexpected' });
    expectNoRawValues(verdict);
  });

  test('in a real browser: only the synthetic payload reaches the server; logs hold no values', async ({
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
    const received: string[] = [];
    const server = https.createServer(
      {
        key: fs.readFileSync(path.join(dir, 'key.pem')),
        cert: fs.readFileSync(path.join(dir, 'cert.pem')),
      },
      (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          received.push(`${req.method} ${req.url} ${body}`);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<p>ok</p>');
        });
      },
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const events: NetworkEvent[] = [];
    await installGuestGuard(
      context,
      host,
      (e) => events.push(e),
      undefined,
      [{ method: 'POST', pathPrefix: '/api/v1/login', operation: 'login attempt', body: RULE }],
      WEB_SYNTHETIC_VALUES,
    );
    const page = await context.newPage();
    await page.goto(`https://${host}/`);
    const post = (payload: unknown) =>
      page.evaluate(
        (body) =>
          fetch('/api/v1/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          }).then(
            (r) => r.status,
            () => -1,
          ),
        JSON.stringify(payload),
      );
    expect(await post({ phone: SYNTHETIC_PHONE, password: SYNTHETIC_PASSWORD })).toBe(200);
    expect(await post({ phone: REAL_LOOKING_PHONE, password: REAL_LOOKING_PASSWORD })).toBe(-1);
    await context.close();
    server.close();

    const posts = received.filter((r) => r.startsWith('POST'));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain(SYNTHETIC_PHONE);
    const blocked = events.filter((e) => e.kind === 'unexpected');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toMatch(
      /body rejected: field phone is not an approved synthetic value/,
    );
    expect(blocked[0].body?.fields.map((f) => f.name)).toEqual(['phone', 'password']);
    expectNoRawValues(events);
  });
});
