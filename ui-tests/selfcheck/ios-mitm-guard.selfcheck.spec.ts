import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import tls from 'node:tls';
import { createMitmGuardProxy } from '../../src/network/mitm-guard-proxy';
import type { NetworkEvent } from '../../src/network/request-guard';
import { ensureTestCa, leafFor } from '../../src/network/test-ca';
import { WEB_SYNTHETIC_VALUES } from '../../src/network/web-approved-requests';
import { expect, test } from '../support/fixtures';

/**
 * Offline selfchecks for the iOS simulator guard proxy: everything on 127.0.0.1, a throwaway
 * test CA under the selfcheck output folder, and test-only host names mapped to a local server.
 */
const STAGING = 'staging.selfcheck.invalid';
const PHONE = WEB_SYNTHETIC_VALUES.unregisteredPhone;
const REAL_LOOKING_PHONE = '0551234567';

interface Reply {
  status: number;
  body: string;
}

/** Sends one HTTPS request through the proxy, trusting only `ca` (as the simulator would). */
function viaProxy(
  proxyPort: number,
  host: string,
  ca: string,
  method: string,
  path: string,
  body?: string,
): Promise<Reply | string> {
  return new Promise((resolve) => {
    const connect = http.request({
      host: '127.0.0.1',
      port: proxyPort,
      method: 'CONNECT',
      path: `${host}:443`,
    });
    connect.on('connect', (_res, socket) => {
      const req = https.request(
        {
          host,
          method,
          path,
          headers: body ? { 'content-type': 'application/json' } : {},
          createConnection: () => tls.connect({ socket, servername: host, ca }),
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
        },
      );
      req.on('error', (e) => resolve(`error:${(e as NodeJS.ErrnoException).code ?? e.message}`));
      req.end(body);
    });
    connect.on('error', (e) => resolve(`connect-error:${(e as NodeJS.ErrnoException).code}`));
    connect.end();
  });
}

test.describe('iOS simulator guard proxy (selfcheck)', () => {
  test('inspects method, path and body before forwarding; halts on the first unexpected request', async () => {
    const ca = ensureTestCa(test.info().outputPath('ca'));
    // Leaf certificate: SAN for the host and serverAuth only (what iOS requires).
    const leaf = leafFor(ca, STAGING);
    const text = execFileSync('openssl', ['x509', '-noout', '-text'], {
      input: leaf.cert,
    }).toString();
    expect(text).toContain(`DNS:${STAGING}`);
    expect(text).toContain('TLS Web Server Authentication');

    // Local "staging" upstream, served with a test-CA certificate.
    const received: string[] = [];
    const upstreamCert = leafFor(ca, STAGING);
    const upstream = https.createServer(upstreamCert, (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push(`${req.method} ${req.url} ${body}`);
        if (req.url === '/api/v1/redirect') {
          res.writeHead(302, { Location: '/elsewhere' });
          return res.end();
        }
        res.end('UPSTREAM-OK');
      });
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    const upPort = (upstream.address() as AddressInfo).port;

    const events: NetworkEvent[] = [];
    const allowed: string[] = [];
    const proxy = createMitmGuardProxy({
      ca,
      stagingHost: STAGING,
      approved: [
        {
          method: 'POST',
          pathPrefix: '/api/v1/check-phone',
          operation: 'unregistered phone check',
          body: { format: 'json', fields: { phone: [PHONE] } },
        },
        {
          method: 'POST',
          pathPrefix: '/api/v1/redirect',
          operation: 'test',
          body: { format: 'json', fields: { phone: [PHONE] } },
        },
      ],
      synthetic: WEB_SYNTHETIC_VALUES,
      onEvent: (e) => events.push(e),
      onAllowed: (e) => allowed.push(`${e.method} ${e.target}`),
      resolveUpstream: () => ({ host: '127.0.0.1', port: upPort }),
      upstreamCa: ca.cert,
    });
    const port = await proxy.listen();

    // 1. GET to staging: decrypted with the test CA, forwarded, answered.
    expect(await viaProxy(port, STAGING, ca.cert, 'GET', '/en/login')).toEqual({
      status: 200,
      body: 'UPSTREAM-OK',
    });
    // 2. Approved endpoint with the synthetic payload: forwarded.
    expect(
      await viaProxy(
        port,
        STAGING,
        ca.cert,
        'POST',
        '/api/v1/check-phone',
        JSON.stringify({ phone: PHONE }),
      ),
    ).toMatchObject({ status: 200 });
    // 3. Analytics host: closed as expected, no halt.
    expect(await viaProxy(port, 'firestore.googleapis.com', ca.cert, 'GET', '/')).toMatch(/error/);
    expect(proxy.halted).toBe(false);
    // 4. Approved endpoint with a non-synthetic payload: blocked here, never forwarded; halts.
    const blocked = await viaProxy(
      port,
      STAGING,
      ca.cert,
      'POST',
      '/api/v1/check-phone',
      JSON.stringify({ phone: REAL_LOOKING_PHONE }),
    );
    expect(blocked).toMatchObject({ status: 403 });
    expect(proxy.halted).toBe(true);
    // 5. After the halt, even an allowed GET is refused.
    expect(await viaProxy(port, STAGING, ca.cert, 'GET', '/en/login')).not.toEqual({
      status: 200,
      body: 'UPSTREAM-OK',
    });
    await proxy.close();

    expect(received.filter((r) => r.startsWith('POST'))).toEqual([
      `POST /api/v1/check-phone ${JSON.stringify({ phone: PHONE })}`,
    ]);
    expect(allowed).toEqual([`GET ${STAGING}/en/login`, `POST ${STAGING}/api/v1/check-phone`]);
    expect(events.map((e) => `${e.kind} ${e.method}`)).toEqual([
      'expected CONNECT',
      'unexpected POST',
    ]);
    expect(events[1].reason).toMatch(/field phone is not an approved synthetic value/);
    expect(JSON.stringify(events)).not.toContain(REAL_LOOKING_PHONE);
    upstream.close();
  });

  test('refuses a non-staging (production-like) host before any TLS, and unapproved POSTs', async () => {
    const ca = ensureTestCa(test.info().outputPath('ca'));
    const hits: string[] = [];
    const upstream = https.createServer(leafFor(ca, STAGING), (req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.end('UPSTREAM-OK');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    const upPort = (upstream.address() as AddressInfo).port;
    const make = (events: NetworkEvent[]) =>
      createMitmGuardProxy({
        ca,
        stagingHost: STAGING,
        synthetic: WEB_SYNTHETIC_VALUES,
        onEvent: (e) => events.push(e),
        resolveUpstream: () => ({ host: '127.0.0.1', port: upPort }),
        upstreamCa: ca.cert,
      });

    const e1: NetworkEvent[] = [];
    const p1 = make(e1);
    const port1 = await p1.listen();
    expect(await viaProxy(port1, 'mazad.motory.com', ca.cert, 'GET', '/')).toMatch(/error/);
    expect(e1[0]).toMatchObject({
      kind: 'unexpected',
      method: 'CONNECT',
      target: 'mazad.motory.com:443',
    });
    expect(p1.halted).toBe(true);
    await p1.close();

    const e2: NetworkEvent[] = [];
    const p2 = make(e2);
    const port2 = await p2.listen();
    expect(
      await viaProxy(
        port2,
        STAGING,
        ca.cert,
        'POST',
        '/api/v1/login',
        JSON.stringify({ phone: PHONE }),
      ),
    ).toMatchObject({ status: 403 });
    expect(e2[0]).toMatchObject({
      kind: 'unexpected',
      method: 'POST',
      target: `${STAGING}/api/v1/login`,
    });
    expect(e2[0].body?.fields.map((f) => `${f.name}:${f.synthetic}`)).toEqual([
      'phone:unregisteredPhone',
    ]);
    await p2.close();
    upstream.close();

    expect(hits).toEqual([]);
  });
});
