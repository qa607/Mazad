#!/usr/bin/env node
/* global process, console */
/**
 * Creates the OTP request ledger and its integrity anchor
 * (reports/ios-account-state/otp-path-requests.jsonl and .head) ONCE, on purpose. Without them
 * every OTP request is refused (a missing ledger is never treated as empty). Local files only: no
 * device, Appium, staging or account action. Refuses if either file exists, so a damaged ledger is
 * never recreated by it; see docs/ios-otp-ledger-recovery.md. The header and anchor format must equal
 * src/mobile/ios/account/otp-ledger.ts (a selfcheck compares).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HEADER = '{"ledger":"otp-path-requests","version":1}';
const dir = path.resolve('reports', 'ios-account-state');
const ledger = path.join(dir, 'otp-path-requests.jsonl');
const head = path.join(dir, 'otp-path-requests.head');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
if (fs.existsSync(ledger) || fs.existsSync(head)) {
  console.error('The ledger already exists; nothing changed. See docs/ios-otp-ledger-recovery.md.');
  process.exit(1);
}
try {
  const fd = fs.openSync(ledger, 'wx', 0o600);
  fs.writeSync(fd, `${HEADER}\n`);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  const anchor = fs.openSync(head, 'wx', 0o600);
  fs.writeSync(
    anchor,
    `${JSON.stringify({ seq: 0, hash: createHash('sha256').update(HEADER).digest('hex') })}\n`,
  );
  fs.fsyncSync(anchor);
  fs.closeSync(anchor);
  console.log('OTP request ledger and integrity anchor created.');
} catch {
  console.error('Could not create the ledger.');
  process.exitCode = 1;
}
