import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import dotenv from 'dotenv';

/**
 * Test account credentials. They are read from the local .env file only: shell and CI
 * variables are ignored on purpose, so credentials never come from (or leak into) a pipeline.
 */
const ENV_FILE = path.resolve(__dirname, '..', '.env');

function readLocalEnv(): Record<string, string> {
  return fs.existsSync(ENV_FILE) ? dotenv.parse(fs.readFileSync(ENV_FILE)) : {};
}

const localEnv = readLocalEnv();

/** Back-office account. Printing, logging or serialising it shows "[redacted]" instead of the values. */
export class BackendAccount {
  readonly #phone: string;
  readonly #password: string;

  constructor(phone: string, password: string) {
    this.#phone = phone;
    this.#password = password;
  }

  get phone(): string {
    return this.#phone;
  }

  get password(): string {
    return this.#password;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): string {
    return '[redacted]';
  }

  [inspect.custom](): string {
    return '[redacted]';
  }
}

/**
 * Signed-in Dev Root browser session (cookies), written once per run by
 * tests/backend/auth.setup.ts and reused by specs that only need to be logged in.
 * It is a live session token: .auth/ is gitignored and must never be shared.
 */
export const DEV_ROOT_SESSION_FILE = path.resolve(__dirname, '..', '.auth', 'dev-root.json');

export const DEV_ROOT_MISSING_REASON =
  'Dev Root credentials are not set: add DEV_ROOT_PHONE and DEV_ROOT_PASSWORD to the local .env file.';

/** The Dev Root staging account, or null when it is not configured in .env. */
export function getDevRootAccount(): BackendAccount | null {
  const phone = localEnv.DEV_ROOT_PHONE?.trim();
  const password = localEnv.DEV_ROOT_PASSWORD;
  return phone && password ? new BackendAccount(phone, password) : null;
}

/**
 * Back-office roles that have a test account, for the permission specs. Each account is read
 * from .env as <env>_PHONE and <env>_PASSWORD, and must have exactly that one role on staging.
 */
export const BACKEND_ROLES = {
  auctionSupervisor: { label: 'Auction Supervisor', env: 'ROLE_AUCTION_SUPERVISOR' },
  customerSupport: { label: 'Customer Support', env: 'ROLE_CUSTOMER_SUPPORT' },
  auctionTeam: { label: 'Auction Team', env: 'ROLE_AUCTION_TEAM' },
  operation: { label: 'operation', env: 'ROLE_OPERATION' },
  // A supplier's own account (role supplierAdmin), read from SUPPLIER_PHONE / SUPPLIER_PASSWORD.
  supplier: { label: 'Supplier (supplierAdmin)', env: 'SUPPLIER' },
  noAuctionAccess: { label: 'Marketing (no auction access)', env: 'ROLE_NO_AUCTION_ACCESS' },
} as const;

export type BackendRole = keyof typeof BACKEND_ROLES;

/** A role's test account, or null when it is not configured in .env. */
export function getRoleAccount(role: BackendRole): BackendAccount | null {
  const { env } = BACKEND_ROLES[role];
  const phone = localEnv[`${env}_PHONE`]?.trim();
  const password = localEnv[`${env}_PASSWORD`];
  return phone && password ? new BackendAccount(phone, password) : null;
}

/** Signed-in browser session of a role's account, saved once per run like Dev Root's. */
export function roleSessionFile(role: BackendRole): string {
  return path.resolve(__dirname, '..', '.auth', `role-${role}.json`);
}

export function roleMissingReason(role: BackendRole): string {
  const { label, env } = BACKEND_ROLES[role];
  return `${label} account is not set: add ${env}_PHONE and ${env}_PASSWORD to the local .env file.`;
}

export const SUPPLIER_MISSING_REASON =
  'Supplier account is not set: add SUPPLIER_PHONE and SUPPLIER_PASSWORD to the local .env file.';

/**
 * A staging supplier account (role supplierAdmin), used to check what a supplier can see.
 * Null when it is not configured in .env.
 */
export function getSupplierAccount(): BackendAccount | null {
  const phone = localEnv.SUPPLIER_PHONE?.trim();
  const password = localEnv.SUPPLIER_PASSWORD;
  return phone && password ? new BackendAccount(phone, password) : null;
}

/**
 * Supplier ID of the SUPPLIER_PHONE account (SUPPLIER_ID in .env), so data-scope checks compare
 * the right supplier. Null when no supplier account is set; an account without its ID is a
 * configuration error, raised rather than guessed.
 */
export function getSupplierAccountId(): string | null {
  if (!getSupplierAccount()) return null;
  const id = localEnv.SUPPLIER_ID?.trim();
  if (!id || !/^\d+$/.test(id)) {
    throw new Error('SUPPLIER_ID is not set: add the supplier ID of SUPPLIER_PHONE to .env.');
  }
  return id;
}

/** ERPNext account. Printing, logging or serialising it shows "[redacted]" instead of the values. */
export class ErpAccount {
  readonly #user: string;
  readonly #password: string;

  constructor(user: string, password: string) {
    this.#user = user;
    this.#password = password;
  }

  get user(): string {
    return this.#user;
  }

  get password(): string {
    return this.#password;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): string {
    return '[redacted]';
  }

  [inspect.custom](): string {
    return '[redacted]';
  }
}

export const ERP_MISSING_REASON =
  'ERPNext credentials are not set: add ERP_USER and ERP_PASSWORD to the local .env file.';

/** The ERPNext staging account, or null when it is not configured in .env. */
export function getErpAccount(): ErpAccount | null {
  const user = localEnv.ERP_USER?.trim();
  const password = localEnv.ERP_PASSWORD;
  return user && password ? new ErpAccount(user, password) : null;
}
