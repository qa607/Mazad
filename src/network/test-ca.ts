import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Local test certificate authority for HTTPS inspection in the iOS Simulator. Uses the system
 * `openssl` (no dependency). The CA is trusted only by the simulator it is added to
 * (`xcrun simctl keychain <udid> add-root-cert`), never by the Mac or a physical device. Keys
 * stay in a gitignored folder (default: reports/ios-guard/ca) and are never logged.
 */
export interface TestCa {
  dir: string;
  certPath: string;
  keyPath: string;
  /** PEM of the CA certificate (public). */
  cert: string;
}

const run = (args: string[], cwd: string) => execFileSync('openssl', args, { cwd, stdio: 'pipe' });

/** Creates the CA in `dir` if it does not exist yet, and returns it. */
export function ensureTestCa(dir: string): TestCa {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const certPath = path.join(dir, 'mazad-qa-test-ca.pem');
  const keyPath = path.join(dir, 'mazad-qa-test-ca.key');
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    run(['genrsa', '-out', keyPath, '2048'], dir);
    fs.chmodSync(keyPath, 0o600);
    run(
      [
        'req',
        '-x509',
        '-new',
        '-key',
        keyPath,
        '-sha256',
        '-days',
        '30',
        '-out',
        certPath,
        '-subj',
        '/CN=Mazad QA test CA (simulator only)',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
        '-addext',
        'keyUsage=critical,keyCertSign,cRLSign',
      ],
      dir,
    );
  }
  return { dir, certPath, keyPath, cert: fs.readFileSync(certPath, 'utf8') };
}

/** A server certificate for `host`, signed by the test CA (cached per host). */
export function leafFor(ca: TestCa, host: string): { key: string; cert: string } {
  if (!/^[a-z0-9.-]+$/i.test(host))
    throw new Error(`Refusing a certificate for an invalid host name.`);
  const leafDir = path.join(ca.dir, 'leaf');
  fs.mkdirSync(leafDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(leafDir, 'leaf.key');
  if (!fs.existsSync(keyPath)) {
    run(['genrsa', '-out', keyPath, '2048'], leafDir);
    fs.chmodSync(keyPath, 0o600);
  }
  const certPath = path.join(leafDir, `${host}.pem`);
  if (!fs.existsSync(certPath)) {
    const csr = path.join(leafDir, `${host}.csr`);
    const ext = path.join(leafDir, `${host}.ext`);
    fs.writeFileSync(
      ext,
      [
        'basicConstraints=CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        'extendedKeyUsage=serverAuth',
        `subjectAltName=DNS:${host}`,
      ].join('\n'),
    );
    run(['req', '-new', '-key', keyPath, '-subj', `/CN=${host}`, '-out', csr], leafDir);
    // Short validity (iOS limits server certificate lifetimes).
    run(
      [
        'x509',
        '-req',
        '-in',
        csr,
        '-CA',
        ca.certPath,
        '-CAkey',
        ca.keyPath,
        '-CAcreateserial',
        '-days',
        '30',
        '-sha256',
        '-extfile',
        ext,
        '-out',
        certPath,
      ],
      leafDir,
    );
  }
  return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8') };
}
