import http from 'node:http';
import https from 'node:https';
import type net from 'node:net';
import tls from 'node:tls';
import { summarizeBody } from './request-body';
import {
  type ApprovedRequest,
  classifyRequest,
  describeTarget,
  EXPECTED_BLOCKED_SCRIPT,
  S3_IMAGE_HOST,
  type NetworkEvent,
} from './request-guard';
import { leafFor, type TestCa } from './test-ca';

/**
 * Request-inspecting guard proxy for an app in the iOS Simulator (the app routes its traffic to
 * it, and the simulator trusts the test CA). Every request is classified by method, host, path
 * and body with the same rules as the Web guard (src/network/request-guard.ts) BEFORE anything
 * is forwarded:
 * - CONNECT to a host that is not allowed: refused before the TLS handshake (expected-blocked
 *   analytics/Firebase hosts are closed without halting; anything else halts).
 * - Allowed hosts: TLS is terminated with a test-CA certificate, each request is read in full
 *   (body included) and classified; only allowed requests are forwarded, with normal upstream
 *   certificate verification.
 * - An approved non-GET request that is answered with a redirect is not passed on.
 * - WebSocket upgrades are refused.
 * - First unexpected request: the proxy halts and refuses everything afterwards.
 */
export interface MitmGuardOptions {
  ca: TestCa;
  /** The only staging host, e.g. stg-mazad-v3-154.motory.dev. */
  stagingHost: string;
  approved?: readonly ApprovedRequest[];
  synthetic?: Readonly<Record<string, string>>;
  onEvent: (event: NetworkEvent) => void;
  /** Also reported for allowed requests (method, host, path only) — the runtime backend evidence. */
  onAllowed?: (event: { method: string; target: string }) => void;
  /** Tests only: where to connect for a host, and an extra CA to trust upstream. */
  resolveUpstream?: (host: string, port: number) => { host: string; port: number };
  upstreamCa?: string;
}

const REDIRECT = new Set([301, 302, 303, 307, 308]);
/** Hosts whose rules depend on the path (only some paths allowed or expected-blocked). */
const PER_PATH_HOSTS = new Set([S3_IMAGE_HOST, EXPECTED_BLOCKED_SCRIPT.host]);
const READ = new Set(['GET', 'HEAD']);

export function createMitmGuardProxy(options: MitmGuardOptions) {
  const approved = options.approved ?? [];
  const synthetic = options.synthetic ?? {};
  let halted = false;
  const sockets = new Set<net.Socket>();
  const events: NetworkEvent[] = [];
  const emit = (event: NetworkEvent) => {
    events.push(event);
    options.onEvent(event);
    if (event.kind === 'unexpected' && !halted) {
      halted = true;
      for (const s of sockets) s.destroy();
    }
  };
  const track = (s: net.Socket) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('error', () => undefined);
  };
  const upstreamOf = (host: string, port: number) =>
    options.resolveUpstream ? options.resolveUpstream(host, port) : { host, port };

  /** Classifies and forwards one fully read request. */
  async function handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    scheme: 'https' | 'http',
    host: string,
    port: number,
  ): Promise<void> {
    if (halted) {
      res.writeHead(403).end('halted');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const method = req.method ?? 'GET';
    const path =
      scheme === 'http'
        ? new URL(req.url ?? '/').pathname + new URL(req.url ?? '/').search
        : (req.url ?? '/');
    const url = `${scheme}://${host}${port === (scheme === 'https' ? 443 : 80) ? '' : `:${port}`}${path}`;
    const contentType = req.headers['content-type'];
    const verdict = classifyRequest(method, url, options.stagingHost, approved, {
      contentType,
      postData: body.length ? body.toString('utf8') : null,
    });
    if (verdict.action !== 'allow') {
      res.writeHead(403).end('blocked by the QA request guard');
      emit({
        kind: verdict.kind,
        method,
        target: describeTarget(url),
        reason: verdict.reason,
        body: READ.has(method)
          ? undefined
          : summarizeBody(contentType, body.length ? body.toString('utf8') : null, synthetic),
      });
      return;
    }
    options.onAllowed?.({ method, target: describeTarget(url) });
    const up = upstreamOf(host, port);
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: req.headers.host ?? host };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const client = scheme === 'https' ? https : http;
    const upstream = client.request(
      {
        host: up.host,
        port: up.port,
        method,
        path,
        headers,
        ...(scheme === 'https'
          ? { servername: host, ...(options.upstreamCa ? { ca: options.upstreamCa } : {}) }
          : {}),
      },
      (upRes) => {
        if (!READ.has(method) && REDIRECT.has(upRes.statusCode ?? 0)) {
          upRes.resume();
          res.writeHead(502).end('blocked by the QA request guard');
          emit({
            kind: 'unexpected',
            method,
            target: describeTarget(url),
            reason: `${method} answered with a redirect`,
          });
          return;
        }
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502).end('upstream error');
    });
    upstream.end(body);
  }

  const inner = (host: string, port: number) => {
    const server = http.createServer((req, res) => void handle(req, res, 'https', host, port));
    server.on('upgrade', (req, socket) => {
      emit({
        kind: 'unexpected',
        method: 'WEBSOCKET',
        target: describeTarget(`https://${host}${req.url ?? '/'}`),
        reason: 'WebSockets are not allowed',
      });
      socket.destroy();
    });
    return server;
  };

  const proxy = http.createServer((req, res) => {
    // Plain HTTP through the proxy (absolute-form URL).
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      emit({
        kind: 'unexpected',
        method: req.method ?? '?',
        target: String(req.url).slice(0, 80),
        reason: 'not an absolute URL',
      });
      res.writeHead(400).end();
      return;
    }
    void handle(req, res, 'http', target.hostname, Number(target.port || 80));
  });

  proxy.on('connect', (req, socket: net.Socket, head: Buffer) => {
    track(socket);
    if (halted) return socket.destroy();
    const [host, portText] = (req.url ?? '').split(/:(?=\d+$)/);
    const port = Number(portText);
    // Host-level check before any TLS: a GET to the root must be allowed for this host.
    const verdict = classifyRequest(
      'GET',
      `https://${host}:${port}/`,
      options.stagingHost,
      approved,
    );
    const hostAllowed =
      port === 443 &&
      (verdict.action === 'allow' ||
        // Hosts with per-path rules: let the host through; each request is classified by path.
        PER_PATH_HOSTS.has(host));
    if (!hostAllowed) {
      const kind = verdict.action === 'block' ? verdict.kind : 'unexpected';
      emit({
        kind,
        method: 'CONNECT',
        target: `${host}:${port}`,
        reason: verdict.action === 'block' ? verdict.reason : `port ${port} is not allowed`,
      });
      return socket.destroy();
    }
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
    const { key, cert } = leafFor(options.ca, host);
    const tlsSocket = new tls.TLSSocket(socket, { isServer: true, key, cert });
    track(tlsSocket);
    if (head?.length) socket.unshift(head);
    inner(host, port).emit('connection', tlsSocket);
  });

  return {
    events,
    get halted() {
      return halted;
    },
    listen: (port = 0, hostname = '127.0.0.1') =>
      new Promise<number>((resolve) =>
        proxy.listen(port, hostname, () => resolve((proxy.address() as net.AddressInfo).port)),
      ),
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        proxy.close(() => resolve());
      }),
  };
}
