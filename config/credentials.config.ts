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

export const DEV_ROOT_MISSING_REASON =
  'Dev Root credentials are not set: add DEV_ROOT_PHONE and DEV_ROOT_PASSWORD to the local .env file.';

/** The Dev Root staging account, or null when it is not configured in .env. */
export function getDevRootAccount(): BackendAccount | null {
  const phone = localEnv.DEV_ROOT_PHONE?.trim();
  const password = localEnv.DEV_ROOT_PASSWORD;
  return phone && password ? new BackendAccount(phone, password) : null;
}
