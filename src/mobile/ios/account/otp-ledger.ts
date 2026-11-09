import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The OTP-path request ledger: a durable, tamper-evident, concurrency-safe record of every request
 * that can send an OTP. Standalone on purpose (only node: modules, no project imports, no
 * TypeScript-only runtime syntax) so that offline selfchecks can load it in separate processes and
 * prove that parallel workers cannot bypass a limit.
 *
 * Guarantees (and their limits):
 * - DURABLE: an append is written and flushed (fsync) before it returns; the file survives a
 *   process restart. Nothing is held only in memory.
 * - EXCLUSIVE: every read-check-append runs under an exclusive lock, so two processes (parallel
 *   workers) can never both pass a "only N allowed" check. The lock file is created atomically with
 *   its full content (link of a finished temp file), and records the owner: pid, host, a token and
 *   the process start time.
 * - CRASH RECOVERY: a lock whose owner is PROVEN dead on this host is removed, by one process at a time
 *   (a recovery claim), after re-checking that it is still the same dead owner's lock. Proof of death:
 *   the pid no longer exists, or it exists with a different process start time (pid reuse). A lock
 *   whose owner is alive, on another host, whose start time cannot be read, or that cannot be parsed,
 *   is NEVER removed (fail closed). A recovery that was itself interrupted leaves its claim file, which
 *   also fails closed. Limit: this relies on a local filesystem with atomic link/rename/exclusive
 *   create (not a network filesystem) and on `ps` for the start time; where it cannot be proven, the
 *   run is refused and the QA owner follows docs/ios-otp-ledger-recovery.md.
 * - FAIL CLOSED: a missing ledger or integrity anchor, a wrong header, a malformed or extra field, a
 *   broken sequence or hash link, a partial last line, an anchor that disagrees with the ledger
 *   (truncation, replacement or restore) or an unreadable file all refuse. A missing ledger is never
 *   treated as "empty" and a damaged one is never recreated: it is created on purpose
 *   (initializeLedger) and only by the QA owner.
 * - TAMPER-EVIDENT, NOT TAMPER-PROOF: every line carries its sequence number and the SHA-256 of the
 *   previous line, and a separate anchor file holds the last sequence number and hash. Accidental edits,
 *   deleted or reordered lines, a cut-off end, a swapped-in older or fresh file are detected. Someone who
 *   deliberately rewrites BOTH files consistently cannot be detected; this is a safety net against
 *   mistakes, not against a person who can edit files.
 * - NO SECRETS: only timestamps, the run id, the run kind, the scenario name and the target kind
 *   are stored. A scenario name containing a long digit run (a phone number) is refused.
 */
export const LEDGER_FILE = 'otp-path-requests.jsonl';
export const HEAD_FILE = 'otp-path-requests.head';
export const LOCK_FILE = 'otp-path-requests.lock';
export const CLAIM_FILE = 'otp-path-requests.lock.recovery';
export const LEDGER_HEADER = '{"ledger":"otp-path-requests","version":1}';
export const RECOVERY_DOC = 'docs/ios-otp-ledger-recovery.md';
/** How long a process waits for the ledger lock before it refuses. */
export const LOCK_WAIT_MS = 10_000;

export type LedgerTarget = 'registered' | 'unregistered';

export interface LedgerEntry {
  seq: number;
  at: string;
  runId: string;
  kind: string;
  scenario: string;
  target: LedgerTarget;
  /** SHA-256 (hex) of the previous raw line (the header for the first entry). */
  prev: string;
}

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const NAME = /^[A-Za-z0-9._:-]{1,120}$/;
const KEYS = ['at', 'kind', 'prev', 'runId', 'scenario', 'seq', 'target'];
const recover = ` Recovery: see ${RECOVERY_DOC}.`;

/** A name is safe when it is plain text and holds no run of 7 or more digits (a phone number). */
export function safeName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value) && !/\d{7,}/.test(value);
}

const ledgerPath = (dir: string) => path.join(dir, LEDGER_FILE);
const headPath = (dir: string) => path.join(dir, HEAD_FILE);

/** Writes a finished file and publishes it at `target` atomically, failing if `target` exists. */
function createExclusive(target: string, content: string): void {
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600, flag: 'wx' });
  try {
    fs.linkSync(temp, target);
  } finally {
    fs.unlinkSync(temp);
  }
}

/** Replaces `target` atomically with durable content (temp file, fsync, rename). */
function replaceAtomically(target: string, content: string): void {
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, target);
}

const headContent = (seq: number, hash: string) => `${JSON.stringify({ seq, hash })}\n`;

/**
 * Creates the ledger (header only) and its integrity anchor. Refuses when either exists: it is
 * created once, on purpose, by the QA owner, and a damaged ledger is never recreated.
 */
export function initializeLedger(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.existsSync(headPath(dir))) {
    throw new LedgerError('The OTP request ledger already exists; it is never recreated.');
  }
  try {
    createExclusive(ledgerPath(dir), `${LEDGER_HEADER}\n`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new LedgerError('The OTP request ledger already exists; it is never recreated.');
    }
    throw new LedgerError('The OTP request ledger cannot be created.');
  }
  replaceAtomically(headPath(dir), headContent(0, sha(LEDGER_HEADER)));
}

interface LedgerState {
  entries: LedgerEntry[];
  /** Raw lines, header first. */
  lines: string[];
}

/** Reads and strictly validates the ledger and its anchor. Throws LedgerError for anything but a perfect pair. */
function readState(dir: string): LedgerState {
  let raw: string;
  try {
    raw = fs.readFileSync(ledgerPath(dir), 'utf8');
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new LedgerError(
      missing
        ? `The OTP request ledger is missing; it is not treated as empty and is never recreated automatically.${recover}`
        : `The OTP request ledger is unreadable.${recover}`,
    );
  }
  const corrupted = (why: string) =>
    new LedgerError(`The OTP request ledger is corrupted (${why}).${recover}`);
  if (raw.length === 0 || !raw.endsWith('\n')) throw corrupted('empty or cut off');
  const lines = raw.slice(0, -1).split('\n');
  if (lines[0] !== LEDGER_HEADER) throw corrupted('header is wrong');
  const entries: LedgerEntry[] = [];
  let previous = LEDGER_HEADER;
  for (let i = 1; i < lines.length; i++) {
    const bad = (why: string) => corrupted(`line ${i + 1}: ${why}`);
    let value: unknown;
    try {
      value = JSON.parse(lines[i]);
    } catch {
      throw bad('not valid JSON');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw bad('not an object');
    }
    const entry = value as Record<string, unknown>;
    if (Object.keys(entry).sort().join() !== KEYS.join()) throw bad('unexpected fields');
    if (entry.seq !== i) throw bad('wrong sequence number');
    if (entry.prev !== sha(previous)) throw bad('broken hash link');
    if (typeof entry.at !== 'string' || Number.isNaN(Date.parse(entry.at))) throw bad('bad time');
    if (!safeName(entry.runId) || !safeName(entry.kind) || !safeName(entry.scenario)) {
      throw bad('unsafe text');
    }
    if (entry.target !== 'registered' && entry.target !== 'unregistered') throw bad('bad target');
    entries.push(entry as unknown as LedgerEntry);
    previous = lines[i];
  }

  // The integrity anchor: the last sequence number and hash, kept in a separate file.
  let head: unknown;
  try {
    head = JSON.parse(fs.readFileSync(headPath(dir), 'utf8'));
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    throw missing
      ? corrupted('the integrity anchor file is missing')
      : corrupted('the integrity anchor is unreadable');
  }
  const h = head as { seq?: unknown; hash?: unknown };
  if (
    typeof head !== 'object' ||
    head === null ||
    Object.keys(head).sort().join() !== 'hash,seq' ||
    !Number.isInteger(h.seq) ||
    typeof h.hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(h.hash)
  ) {
    throw corrupted('the integrity anchor is malformed');
  }
  const seq = h.seq as number;
  const last = entries.length;
  if (seq > last) {
    throw corrupted(
      `the ledger holds ${last} entries but the anchor recorded ${seq}: entries were removed or the file was replaced`,
    );
  }
  if (seq < last - 1) {
    throw corrupted(
      `the anchor recorded ${seq} but the ledger holds ${last}: the anchor is stale or the ledger was changed`,
    );
  }
  // seq === last: the normal case. seq === last - 1: a crash between the append and the anchor
  // update, which is harmless: the extra line already chains to the anchored hash.
  if (h.hash !== sha(lines[seq])) throw corrupted('the anchor does not match the ledger');
  return { entries, lines };
}

/** The ledger's entries, strictly validated. */
export function readLedger(dir: string): LedgerEntry[] {
  return readState(dir).entries;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Who owns a lock file. */
export interface LockOwner {
  v: 1;
  pid: number;
  host: string;
  token: string;
  startedAt: string;
  /** The owner's process start time (`ps -o lstart=`), to tell a reused pid from the owner. */
  procStart: string | null;
}

/** The start time of a process, or null when it cannot be read. */
export function processStartTime(pid: number): string | null {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 3_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export type OwnerStatus = 'alive' | 'dead' | 'unknown';

/**
 * Whether a lock owner is alive. 'dead' only when PROVEN: this host, and the pid does not exist or
 * exists with another start time. Anything that cannot be proven is 'unknown' (never 'dead').
 */
export function ownerStatus(owner: LockOwner): OwnerStatus {
  if (owner.host !== os.hostname()) return 'unknown';
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'alive';
  }
  if (owner.procStart === null) return 'unknown'; // cannot exclude a reused pid
  const current = processStartTime(owner.pid);
  if (current === null) return 'unknown';
  return current === owner.procStart ? 'alive' : 'dead';
}

const newOwner = (): LockOwner => ({
  v: 1,
  pid: process.pid,
  host: os.hostname(),
  token: randomBytes(8).toString('hex'),
  startedAt: new Date().toISOString(),
  procStart: processStartTime(process.pid),
});

type ReadOwner = { owner: LockOwner } | 'gone' | 'invalid';

function readOwner(file: string): ReadOwner {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'gone' : 'invalid';
  }
  try {
    const owner = JSON.parse(text) as LockOwner;
    const ok =
      owner &&
      owner.v === 1 &&
      Number.isInteger(owner.pid) &&
      owner.pid > 0 &&
      typeof owner.host === 'string' &&
      typeof owner.token === 'string' &&
      (owner.procStart === null || typeof owner.procStart === 'string');
    return ok ? { owner } : 'invalid';
  } catch {
    return 'invalid';
  }
}

function releaseIfMine(file: string, token: string): void {
  const current = readOwner(file);
  if (current !== 'gone' && current !== 'invalid' && current.owner.token === token) {
    try {
      fs.unlinkSync(file);
    } catch {
      // Already gone: nothing to release.
    }
  }
}

/**
 * Removes the lock of a PROVEN dead owner, one process at a time (the recovery claim), after
 * re-reading it: only the same dead owner's lock is ever removed. Returns normally when it removed
 * it or when another process is recovering (the caller loops); throws when it must not go on.
 */
function recoverStaleLock(dir: string, dead: LockOwner): void {
  const lock = path.join(dir, LOCK_FILE);
  const claim = path.join(dir, CLAIM_FILE);
  const mine = newOwner();
  try {
    createExclusive(claim, JSON.stringify(mine));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new LedgerError(`The OTP request ledger lock cannot be recovered.${recover}`);
    }
    const other = readOwner(claim);
    if (other !== 'gone' && other !== 'invalid' && ownerStatus(other.owner) === 'alive') return;
    if (other === 'gone') return;
    // The process that was recovering is gone (or cannot be verified): not removed automatically.
    throw new LedgerError(
      `A lock recovery was interrupted (${CLAIM_FILE} is left behind); the ledger stays refused until the QA owner has checked it.${recover}`,
    );
  }
  try {
    const again = readOwner(lock);
    if (
      again !== 'gone' &&
      again !== 'invalid' &&
      again.owner.token === dead.token &&
      ownerStatus(again.owner) === 'dead'
    ) {
      fs.unlinkSync(lock);
    }
  } finally {
    releaseIfMine(claim, mine.token);
  }
}

/** Takes the exclusive lock and returns the function that releases it. Never removes a live owner's lock. */
export function acquireLedgerLock(dir: string, waitMs: number): () => void {
  const lock = path.join(dir, LOCK_FILE);
  const owner = newOwner();
  const content = JSON.stringify(owner);
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      createExclusive(lock, content);
      return () => releaseIfMine(lock, owner.token);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new LedgerError('The OTP request ledger cannot be locked.');
      }
    }
    const current = readOwner(lock);
    if (current === 'gone') continue;
    if (current === 'invalid') {
      throw new LedgerError(
        `The ledger lock file is unreadable or malformed; it is not removed automatically.${recover}`,
      );
    }
    const status = ownerStatus(current.owner);
    if (status === 'dead') {
      recoverStaleLock(dir, current.owner);
      // Removed, or another process is recovering: look again shortly (and never spin past the deadline).
      if (Date.now() >= deadline) {
        throw new LedgerError(
          `The OTP request ledger lock could not be recovered in time.${recover}`,
        );
      }
      sleep(10);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new LedgerError(
        status === 'alive'
          ? `The OTP request ledger is locked by another running process (pid ${current.owner.pid}).`
          : `The OTP request ledger is locked and its owner cannot be verified (another host, or its start time cannot be read); the lock is not removed automatically.${recover}`,
      );
    }
    sleep(10);
  }
}

export interface AppendRequest {
  runId: string;
  kind: string;
  scenario: string;
  target: LedgerTarget;
  at: Date;
  /**
   * Runs UNDER the lock, on the validated entries, immediately before the append. Returns a reason
   * to refuse (nothing is written), or undefined to allow it. This is where limits are enforced, so
   * no other process can add a request between the check and the write.
   */
  check?: (entries: readonly LedgerEntry[]) => string | undefined;
  lockWaitMs?: number;
}

/** Checks (under the lock) and appends one entry, durably, then moves the anchor. Returns the entry. */
export function appendLedgerEntry(dir: string, request: AppendRequest): LedgerEntry {
  if (
    !safeName(request.runId) ||
    !safeName(request.kind) ||
    !safeName(request.scenario) ||
    (request.target !== 'registered' && request.target !== 'unregistered') ||
    Number.isNaN(request.at.getTime())
  ) {
    throw new LedgerError('The ledger entry is not valid (unsafe or missing text).');
  }
  const release = acquireLedgerLock(dir, request.lockWaitMs ?? LOCK_WAIT_MS);
  try {
    const { entries, lines } = readState(dir);
    const refusal = request.check?.(entries);
    if (refusal) throw new LedgerError(refusal);
    const entry: LedgerEntry = {
      seq: entries.length + 1,
      at: request.at.toISOString(),
      runId: request.runId,
      kind: request.kind,
      scenario: request.scenario,
      target: request.target,
      prev: sha(lines[lines.length - 1]),
    };
    const line = JSON.stringify(entry);
    const fd = fs.openSync(ledgerPath(dir), 'a');
    try {
      fs.writeSync(fd, `${line}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    replaceAtomically(headPath(dir), headContent(entry.seq, sha(line)));
    return entry;
  } finally {
    release();
  }
}

/** Ledger entries of this kind are NOT OTP requests: they mark that a VALID OTP was entered. */
export const VALID_OTP_MARKER_KIND = 'otp-valid-entered';

/**
 * Local safety limits of THIS suite. They are NOT backend policy and never replace a recorded backend
 * limit. They follow what the QA owner reported on 2026-11-09 (staging blocks OTP sending after 4
 * requests while no valid OTP is entered, for 24 hours; entering a valid OTP resets that count; a 60
 * second wait between requests), with a margin of one: at most 3 OTP-path requests in a row without a
 * valid OTP entered in between (a valid entry is recorded in this ledger as a reset marker), never
 * two within 60 seconds, and at most 6 in one run as an accident guard. The reported backend values
 * are not yet recorded in the policy file.
 */
export const TECHNICAL_LIMITS = {
  maxRequestsPerRun: 6,
  maxRequestsWithoutValidOtp: 3,
  minMillisBetweenRequests: 60_000,
};

/** Why the suite's own TECHNICAL limits forbid one more request (undefined = within them). */
export function technicalLimitProblem(
  entries: readonly LedgerEntry[],
  runId: string,
  scenario: string,
  now: Date,
): string | undefined {
  const requests = entries.filter((e) => e.kind !== VALID_OTP_MARKER_KIND);
  if (requests.some((e) => e.runId === runId && e.scenario === scenario)) {
    return `"${scenario}" already made its OTP request in this run`;
  }
  if (requests.filter((e) => e.runId === runId).length >= TECHNICAL_LIMITS.maxRequestsPerRun) {
    return `technical safety limit: this run already made ${TECHNICAL_LIMITS.maxRequestsPerRun} OTP-path requests (a limit of this suite, not of the backend)`;
  }
  // Requests since the last valid OTP entry, within the last 24 hours (the reported lock period).
  const day = 24 * 3_600_000;
  const lastValid = Math.max(
    0,
    ...entries.filter((e) => e.kind === VALID_OTP_MARKER_KIND).map((e) => Date.parse(e.at)),
  );
  const withoutValid = requests.filter(
    (e) => Date.parse(e.at) > lastValid && now.getTime() - Date.parse(e.at) < day,
  ).length;
  if (withoutValid >= TECHNICAL_LIMITS.maxRequestsWithoutValidOtp) {
    return `technical safety limit: ${withoutValid} OTP-path request(s) were made since the last valid OTP entry; a valid OTP must be entered before more are requested (a limit of this suite, not of the backend)`;
  }
  const last = Math.max(0, ...requests.map((e) => Date.parse(e.at)));
  if (last && now.getTime() - last < TECHNICAL_LIMITS.minMillisBetweenRequests) {
    return `technical safety limit: the last OTP-path request was less than ${TECHNICAL_LIMITS.minMillisBetweenRequests / 1000} seconds ago (a limit of this suite, not of the backend)`;
  }
  return undefined;
}
