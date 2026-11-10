import { randomBytes } from 'node:crypto';

/**
 * A fresh password for a password-reset test, generated at run time so no password is ever
 * hardcoded or committed. Meets the website's own rule (at least 6 characters) with margin,
 * and includes a symbol and digits per its own guidance (lowercase, uppercase, symbol, number).
 */
export function generateTestPassword(): string {
  return `Qa!${randomBytes(5).toString('hex')}X1`;
}
