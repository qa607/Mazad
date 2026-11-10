import fs from 'node:fs';
import path from 'node:path';

/**
 * Staging-only environment selection for ALL Mazad automation (website, back office, Android,
 * iOS). Pure functions: nothing is loaded at import time.
 *
 * - The approved staging environments are the files in config/environments/<id>.json. Adding a
 *   reviewed file is the only way to approve an environment; there is no default environment.
 * - Production is permanently blocked. There is no override: no variable, file or flag can
 *   enable it (ALLOW_PRODUCTION no longer exists).
 * - BASE_URL / ERP_URL may only repeat the selected environment's approved origins exactly.
 * - Unknown hosts, IP addresses, other schemes, explicit ports, credentials and paths are refused.
 */

export const ENVIRONMENTS_DIR = path.resolve(__dirname, 'environments');

/** Environment names that can never be selected (production by any name). */
export const BLOCKED_ENVIRONMENT_NAME = /prod|(^|-)(live|prd)(-|$)/i;

/**
 * Hosts automation must never target: production, or environment ownership not confirmed.
 * The host itself and every subdomain are refused. Never removed without confirmation.
 */
export const BLOCKED_HOSTS: readonly string[] = ['mazad.motory.com', 'motorymazad.com'];

/** One approved staging environment file. */
export interface StagingEnvironmentFile {
  /** The app/website origin, https only, no port or path. */
  baseURL: string;
  /** ERP (ERPNext) origin used for read-only verification, if this environment has one. */
  erpURL?: string;
  /** Whether the ERP's environment ownership is confirmed; required with erpURL. */
  erpStatus?: 'unconfirmed' | 'confirmed';
}

export interface SelectedEnvironment {
  name: string;
  baseURL: string;
  erpURL?: string;
  erpStatus?: 'unconfirmed' | 'confirmed';
}

const ALLOWED_KEYS = new Set(['baseURL', 'erpURL', 'erpStatus']);
const NAME = /^[a-z0-9][a-z0-9-]{1,40}$/;

const isIpHost = (host: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || host.includes(':');

/** True for a blocked host or any of its subdomains. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));
}

/** Why `raw` is not an acceptable environment origin, or undefined. */
export function originProblem(raw: string, label: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${label} "${raw}" is not a valid URL.`;
  }
  if (url.protocol !== 'https:') return `${label} "${raw}" must use https.`;
  if (url.username || url.password) return `${label} must not contain credentials.`;
  if (url.port !== '') return `${label} "${raw}" must not set a port.`;
  if (isIpHost(url.hostname)) return `${label} "${raw}" must use a host name, not an IP address.`;
  if (isBlockedHost(url.hostname)) {
    return `${label} "${raw}" is a blocked host (production or unconfirmed environment).`;
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    return `${label} "${raw}" must be an origin only (no path, query or fragment).`;
  }
  return undefined;
}

/** Names of the environment files present (approved or not; validated separately). */
export function environmentFileNames(dir: string = ENVIRONMENTS_DIR): string[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort();
}

/** Reads and validates one approved environment file. Throws on anything unexpected. */
export function readEnvironmentFile(
  name: string,
  dir: string = ENVIRONMENTS_DIR,
): StagingEnvironmentFile {
  if (BLOCKED_ENVIRONMENT_NAME.test(name)) {
    throw new Error(
      `Production is permanently blocked: environment "${name}" is refused (no override exists).`,
    );
  }
  if (!NAME.test(name) || !environmentFileNames(dir).includes(name)) {
    throw new Error(
      `"${name}" is not an approved staging environment. Approved: ${environmentFileNames(dir).join(', ') || '(none)'}.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8')) as Record<
    string,
    unknown
  >;
  const unknown = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknown.length) {
    throw new Error(`Environment "${name}": unknown setting(s) ${unknown.join(', ')}.`);
  }
  const file = raw as unknown as StagingEnvironmentFile;
  const baseProblem = originProblem(String(file.baseURL ?? ''), `Environment "${name}" baseURL`);
  if (baseProblem) throw new Error(baseProblem);
  if (file.erpURL !== undefined) {
    const erpProblem = originProblem(String(file.erpURL), `Environment "${name}" erpURL`);
    if (erpProblem) throw new Error(erpProblem);
    if (file.erpStatus !== 'unconfirmed' && file.erpStatus !== 'confirmed') {
      throw new Error(`Environment "${name}": erpStatus must be "unconfirmed" or "confirmed".`);
    }
  } else if (file.erpStatus !== undefined) {
    throw new Error(`Environment "${name}": erpStatus is set without erpURL.`);
  }
  return file;
}

/** Every file in the directory must be a valid approved staging environment (no prod.json). */
export function validateEnvironmentDirectory(dir: string = ENVIRONMENTS_DIR): string[] {
  const names = environmentFileNames(dir);
  for (const name of names) readEnvironmentFile(name, dir);
  return names;
}

/** The approved origin of an environment (e.g. for target checks). */
export function approvedOrigin(name: string, dir: string = ENVIRONMENTS_DIR): string {
  return new URL(readEnvironmentFile(name, dir).baseURL).origin;
}

function overrideOrApproved(
  value: string | undefined,
  approved: string,
  label: string,
  name: string,
): string {
  const approvedOrigin = new URL(approved).origin;
  if (!value?.trim()) return approvedOrigin;
  const problem = originProblem(value.trim(), label);
  if (problem) throw new Error(problem);
  if (new URL(value.trim()).origin !== approvedOrigin) {
    throw new Error(
      `${label} "${value.trim()}" does not match the approved ${approvedOrigin} of environment "${name}".`,
    );
  }
  return approvedOrigin;
}

/**
 * Selects the run's environment from TEST_ENV (explicit; no default), with optional BASE_URL /
 * ERP_URL that must equal the approved origins. Throws, never falls back.
 */
export function selectEnvironment(
  env: NodeJS.ProcessEnv,
  dir: string = ENVIRONMENTS_DIR,
): SelectedEnvironment {
  const names = validateEnvironmentDirectory(dir);
  const name = env.TEST_ENV?.trim();
  if (!name) {
    throw new Error(
      `TEST_ENV is not set. Choose an approved staging environment: ${names.join(', ')}.`,
    );
  }
  let file: StagingEnvironmentFile;
  try {
    file = readEnvironmentFile(name, dir);
  } catch (error) {
    throw new Error(`TEST_ENV: ${(error as Error).message}`, { cause: error });
  }
  const baseURL = overrideOrApproved(env.BASE_URL, file.baseURL, 'BASE_URL', name);
  let erpURL: string | undefined;
  if (file.erpURL) {
    erpURL = overrideOrApproved(env.ERP_URL, file.erpURL, 'ERP_URL', name);
  } else if (env.ERP_URL?.trim()) {
    throw new Error(`ERP_URL is set, but environment "${name}" has no approved ERP.`);
  }
  return { name, baseURL, erpURL, erpStatus: file.erpURL ? file.erpStatus : undefined };
}
