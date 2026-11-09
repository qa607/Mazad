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

  /** The account's internal ID (not a secret). Only set for the iOS Dealer account. */
  readonly id?: string;

  constructor(phone: string, password: string, id?: string) {
    this.#phone = phone;
    this.#password = password;
    this.id = id;
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

export const DEV_ROOT_MISSING_REASON =
  'Dev Root credentials are not set: add DEV_ROOT_PHONE and DEV_ROOT_PASSWORD to the local .env file.';

/** ERP (ERPNext) user. Same redaction as BackendAccount. */
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
  'ERP credentials are not set: add ERP_USER and ERP_PASSWORD to the local .env file.';

export const BUYER_MISSING_REASON =
  'No Mazad buyer (customer) test account: add MAZAD_BUYER_PHONE and MAZAD_BUYER_PASSWORD to the local .env file.';

/** Read-only ERP user, or null when it is not configured in .env. */
export function getErpAccount(): ErpAccount | null {
  const user = localEnv.ERP_USER?.trim();
  const password = localEnv.ERP_PASSWORD;
  return user && password ? new ErpAccount(user, password) : null;
}

/** Mazad customer (buyer) account for the mobile app, or null when it is not configured in .env. */
export function getBuyerAccount(): BackendAccount | null {
  const phone = localEnv.MAZAD_BUYER_PHONE?.trim();
  const password = localEnv.MAZAD_BUYER_PASSWORD;
  return phone && password ? new BackendAccount(phone, password) : null;
}

/** The Dev Root staging account, or null when it is not configured in .env. */
export function getDevRootAccount(): BackendAccount | null {
  const phone = localEnv.DEV_ROOT_PHONE?.trim();
  const password = localEnv.DEV_ROOT_PASSWORD;
  return phone && password ? new BackendAccount(phone, password) : null;
}

export const OTP_MISSING_REASON =
  'The staging OTP is not set: add OTP_CODE to the local .env file.';

/** The fixed OTP staging accepts for phone verification (login, forgot password), or null. */
export function getOtpCode(): string | null {
  const otp = localEnv.OTP_CODE?.trim();
  return otp || null;
}

/**
 * Name fragment used to find dedicated test accounts in the back office (Individuals, Dealers),
 * instead of hardcoding a phone number. Defaults to "test"; override per environment via
 * TEST_ACCOUNT_NAME_FILTER if staging's test-account naming convention ever changes.
 */
export function testAccountNameFilter(): string {
  return process.env.TEST_ACCOUNT_NAME_FILTER || localEnv.TEST_ACCOUNT_NAME_FILTER || 'test';
}

/**
 * The dedicated iOS dealer test account: its internal ID (IOS_TEST_DEALER_ID), phone
 * (IOS_TEST_DEALER_PHONE) and baseline password (IOS_TEST_DEALER_PASSWORD). All three come from
 * .env only; shell and CI variables are ignored, and no account detail is written in source code.
 * Printing the account shows "[redacted]". It is only used once the QA owner has confirmed the
 * account in config/ios-account-policy.ts.
 */
export const IOS_TEST_DEALER_VARIABLES = [
  'IOS_TEST_DEALER_ID',
  'IOS_TEST_DEALER_PHONE',
  'IOS_TEST_DEALER_PASSWORD',
] as const;

/** A valid account ID: 1 to 9 digits, no leading zero. Anything else is rejected (null). */
export function parseIosDealerId(raw: string | undefined): string | null {
  const value = raw?.trim() ?? '';
  return /^[1-9]\d{0,8}$/.test(value) ? value : null;
}

/** The configured Dealer ID, or null when it is missing or not a valid ID. */
export function getIosDealerId(): string | null {
  return parseIosDealerId(localEnv.IOS_TEST_DEALER_ID);
}

/**
 * The Dealer account, or null unless ALL THREE variables are present and the ID is valid, so a
 * partial or malformed configuration fails safely (the tests skip and say which variables are missing).
 */
export function getIosTestDealer(): BackendAccount | null {
  const id = getIosDealerId();
  const phone = localEnv.IOS_TEST_DEALER_PHONE?.trim();
  const password = localEnv.IOS_TEST_DEALER_PASSWORD;
  return id && phone && password ? new BackendAccount(phone, password, id) : null;
}

/** Names (never values) of the given .env variables that are missing or empty. */
export function missingLocalEnv(names: readonly string[]): string[] {
  return names.filter((name) => !localEnv[name]?.trim());
}
