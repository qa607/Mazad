import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  approvedOrigin,
  BLOCKED_HOSTS,
  ENVIRONMENTS_DIR,
  environmentFileNames,
  originProblem,
  selectEnvironment,
  validateEnvironmentDirectory,
} from '../../config/staging-environments';
import { storedBackendCheck, storedBackendProblem } from '../../src/mobile/ios/app-backend-check';
import {
  APPROVED_IOS_BUILDS,
  type IosConfig,
  readIosConfig,
} from '../../src/mobile/ios/ios.config';
import { iosStaticProblem } from '../../src/mobile/ios/ios-preflight';
import { expect, test } from '../support/fixtures';

/** Offline: staging-only environment selection and the iOS stored-backend check (no device). */
const STG = 'https://stg-mazad-v3-224.motory.dev';
const ERP = 'https://erp-stg-fixed.motory.com';
const ROOT = path.resolve(__dirname, '..', '..');

function tempEnvDir(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-selfcheck-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(content));
  }
  return dir;
}

test.describe('Staging-only environments (selfcheck)', () => {
  test('stg-154 is the only approved environment, with its exact URLs', () => {
    expect(environmentFileNames()).toEqual(['stg-154']);
    expect(selectEnvironment({ TEST_ENV: 'stg-154' })).toEqual({
      name: 'stg-154',
      baseURL: STG,
      erpURL: ERP,
      erpStatus: 'unconfirmed',
    });
  });

  test('TEST_ENV is required and never falls back', () => {
    for (const value of [undefined, '', '   ']) {
      expect(() => selectEnvironment({ TEST_ENV: value }), String(value)).toThrow(
        /TEST_ENV is not set/,
      );
    }
  });

  test('production cannot be selected by any name, variable or flag', () => {
    for (const name of ['prod', 'PROD', 'production', 'stg-prod', 'live', 'prd', 'mazad-live']) {
      for (const extra of [{}, { ALLOW_PRODUCTION: 'true' }, { ALLOW_PRODUCTION: '1' }]) {
        expect(() => selectEnvironment({ TEST_ENV: name, ...extra }), name).toThrow(
          /Production is permanently blocked/,
        );
      }
    }
    // The old flag has no effect at all on an approved environment either.
    expect(selectEnvironment({ TEST_ENV: 'stg-154', ALLOW_PRODUCTION: 'true' }).baseURL).toBe(STG);
  });

  test('unapproved environment names are refused (including the old "staging" and stg-155)', () => {
    for (const name of ['staging', 'dev', 'stg-155', 'STG-154', '../stg-154', 'stg-154.json']) {
      expect(() => selectEnvironment({ TEST_ENV: name }), name).toThrow(/TEST_ENV/);
    }
  });

  test('BASE_URL may only repeat the approved origin', () => {
    for (const ok of [STG, `${STG}/`, `${STG}:443`]) {
      expect(selectEnvironment({ TEST_ENV: 'stg-154', BASE_URL: ok }).baseURL, ok).toBe(STG);
    }
    for (const bad of [
      'http://stg-mazad-v3-224.motory.dev',
      `${STG}:8443`,
      `${STG}/en`,
      `${STG}/?x=1`,
      'https://user:pass@stg-mazad-v3-224.motory.dev',
      'https://www.stg-mazad-v3-224.motory.dev',
      'https://stg-mazad-v3-224.motory.dev.evil.invalid',
      'https://stg-mazad-v3-155.motory.dev',
      'https://10.152.0.2',
      'https://167772162',
      'https://[::1]',
      'https://mazad.motory.com',
      'https://api.mazad.motory.com',
      'https://motorymazad.com',
      'https://app-auctions.motory.com',
      'https://v3-auction-common.motory.com',
      'ftp://stg-mazad-v3-224.motory.dev',
      'not a url',
    ]) {
      expect(() => selectEnvironment({ TEST_ENV: 'stg-154', BASE_URL: bad }), bad).toThrow();
    }
  });

  test('ERP_URL may only repeat the approved ERP origin', () => {
    expect(selectEnvironment({ TEST_ENV: 'stg-154', ERP_URL: `${ERP}/` }).erpURL).toBe(ERP);
    for (const bad of [
      'https://erp.motory.com',
      `${ERP}:8443`,
      'http://erp-stg-fixed.motory.com',
    ]) {
      expect(() => selectEnvironment({ TEST_ENV: 'stg-154', ERP_URL: bad }), bad).toThrow();
    }
  });

  test('a production or invalid environment file anywhere in the folder stops every run', () => {
    const good = { baseURL: STG };
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ['prod.json present', { 'stg-154': good, prod: { baseURL: '' } }, /permanently blocked/],
      ['blocked host', { 'stg-x': { baseURL: 'https://mazad.motory.com' } }, /blocked host/],
      ['IP address', { 'stg-x': { baseURL: 'https://10.152.0.2' } }, /IP address/],
      ['http', { 'stg-x': { baseURL: 'http://stg.example.invalid' } }, /https/],
      ['path', { 'stg-x': { baseURL: `${STG}/api` } }, /origin only/],
      ['unknown key', { 'stg-x': { ...good, fallbackURL: STG } }, /unknown setting/],
      ['erp without status', { 'stg-x': { ...good, erpURL: ERP } }, /erpStatus/],
      ['empty baseURL', { 'stg-x': { baseURL: '' } }, /not a valid URL/],
    ];
    for (const [name, files, message] of cases) {
      const dir = tempEnvDir(files);
      try {
        expect(() => validateEnvironmentDirectory(dir), name).toThrow(message);
        expect(() => selectEnvironment({ TEST_ENV: 'stg-154' }, dir), name).toThrow();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('another staging environment can be added later as a reviewed file', () => {
    const dir = tempEnvDir({
      'stg-154': { baseURL: STG },
      'stg-new': { baseURL: 'https://stg-new.example.invalid' },
    });
    try {
      expect(selectEnvironment({ TEST_ENV: 'stg-new' }, dir).baseURL).toBe(
        'https://stg-new.example.invalid',
      );
      expect(() => selectEnvironment({ TEST_ENV: 'stg-new', BASE_URL: STG }, dir)).toThrow(
        /does not match/,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('unconfirmed hosts are blocked or not approved; the ERP stays marked unconfirmed', () => {
    expect([...BLOCKED_HOSTS].sort()).toEqual(['mazad.motory.com', 'motorymazad.com']);
    for (const host of ['mazad.motory.com', 'motorymazad.com']) {
      expect(originProblem(`https://${host}`, 'x')).toMatch(/blocked host/);
    }
    const approvedHosts = environmentFileNames().map((n) => new URL(approvedOrigin(n)).host);
    for (const host of ['app-auctions.motory.com', 'v3-auction-common.motory.com']) {
      expect(approvedHosts).not.toContain(host);
    }
    expect(
      JSON.parse(fs.readFileSync(path.join(ENVIRONMENTS_DIR, 'stg-154.json'), 'utf8')),
    ).toEqual({
      baseURL: STG,
      erpURL: ERP,
      erpStatus: 'unconfirmed',
    });
  });

  test('every CI workflow sets TEST_ENV to an approved environment, literally', () => {
    const dir = path.join(ROOT, '.github', 'workflows');
    const workflows = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    expect(workflows.length, 'workflows found').toBeGreaterThan(0);
    for (const file of workflows) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const values = [...text.matchAll(/^\s*TEST_ENV:\s*(.*?)\s*$/gm)].map((m) => m[1]);
      // A workflow that runs Playwright must choose the environment itself.
      if (/playwright\s+test/.test(text)) expect(values.length, file).toBeGreaterThan(0);
      for (const value of values) {
        // A plain approved name: no ${{ }} expression, fallback, repository variable or secret.
        expect(environmentFileNames(), `${file}: TEST_ENV: ${value}`).toContain(value);
      }
    }
  });

  test('no code reads ALLOW_PRODUCTION and no old environment file or import remains', () => {
    const dirs = ['config', 'src', 'tests', 'tests-ios', 'ui-tests', 'scripts', '.github'];
    const files = dirs.flatMap((d) =>
      fs
        .readdirSync(path.join(ROOT, d), { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(ts|mjs|js|sh|json|ya?ml)$/.test(f))
        .map((f) => path.join(d, f)),
    );
    const rootFiles = fs
      .readdirSync(ROOT)
      .filter((f) => /^(playwright.*\.ts|package\.json|\.env\.example)$/.test(f));
    const offenders = [...files, ...rootFiles].filter((f) => {
      if (f.endsWith('environment.selfcheck.spec.ts')) return false;
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return (
        /env\.ALLOW_PRODUCTION|env\[['"]ALLOW_PRODUCTION['"]\]|ALLOW_PRODUCTION\s*=/.test(text) ||
        /environments\/(staging|prod|dev)\.json/.test(text) ||
        // TEST_ENV=staging (shell, .env) or TEST_ENV: ... 'staging' (YAML, incl. fallbacks).
        /TEST_ENV\s*[=:][^\n]*\b(staging|prod|dev)\b/.test(text)
      );
    });
    expect(offenders).toEqual([]);
    for (const old of ['prod', 'dev', 'staging']) {
      expect(fs.existsSync(path.join(ENVIRONMENTS_DIR, `${old}.json`)), old).toBe(false);
    }
  });
});

test.describe('iOS build ↔ staging environment (selfcheck)', () => {
  const BUILD = APPROVED_IOS_BUILDS[0];

  test('every approved build is tied to an approved staging environment', () => {
    for (const b of APPROVED_IOS_BUILDS) {
      expect(() => approvedOrigin(b.stagingEnvironment), b.bundleId).not.toThrow();
      expect(b.storedBackend.preferencesFile).toMatch(/^Library\/Preferences\/.+\.plist$/);
      expect(b.storedBackend.key).toBeTruthy();
    }
    expect(BUILD.stagingEnvironment).toBe('stg-154');
  });

  test('TEST_ENV must name the environment the build is tied to', () => {
    const env = { IOS_BUNDLE_ID: BUILD.bundleId };
    for (const value of [undefined, 'stg-155', 'staging', 'prod']) {
      expect(iosStaticProblem({ ...env, TEST_ENV: value }), String(value)).toMatch(
        /Safety gate \(environment\).*approved only for the staging environment "stg-154"/,
      );
    }
    expect(iosStaticProblem({ ...env, TEST_ENV: 'stg-154' })).not.toMatch(/environment/);
  });

  test('stored backend: only the approved origin passes; anything unreadable is refused', () => {
    const where = 'Library/Preferences/com.motory.dealer.plist: baseUrl';
    expect(storedBackendProblem(STG, STG, where)).toBeUndefined();
    expect(storedBackendProblem(`${STG}/`, STG, where)).toBeUndefined();
    for (const bad of [
      undefined,
      '',
      'not a url',
      'http://stg-mazad-v3-224.motory.dev',
      'https://mazad.motory.com',
      'https://stg-mazad-v3-155.motory.dev',
      `${STG}:8443`,
    ]) {
      expect(storedBackendProblem(bad, STG, where), String(bad)).toMatch(/run refused/);
    }
  });

  test('stored backend check: device only, reader errors fail closed', async () => {
    const device: IosConfig = readIosConfig({ IOS_BUNDLE_ID: BUILD.bundleId });
    const reads: unknown[] = [];
    const reader =
      (value: string | Error) =>
      (...args: unknown[]) => {
        reads.push(args);
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      };
    expect(await storedBackendCheck(device, STG, reader(`${STG}/`))).toBeUndefined();
    expect(reads[0]).toEqual([device.udid, BUILD.bundleId, BUILD.storedBackend]);
    expect(await storedBackendCheck(device, STG, reader('https://mazad.motory.com'))).toMatch(
      /not the selected staging environment/,
    );
    expect(await storedBackendCheck(device, STG, reader(new Error('device locked')))).toMatch(
      /could not be read \(device locked\): run refused/,
    );
    const sim: IosConfig = { ...device, target: 'simulator' };
    reads.length = 0;
    expect(await storedBackendCheck(sim, STG, reader(STG))).toMatch(/physical device only/);
    expect(reads).toEqual([]);
  });
});
