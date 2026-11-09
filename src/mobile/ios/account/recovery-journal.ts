import fs from 'node:fs';
import path from 'node:path';

/**
 * Recovery journal and app-state marker for the iOS account tests. Files live in the git-ignored
 * reports/ folder (directory mode 0700, files 0600). They NEVER contain a password, an OTP or a
 * full phone number: a masked phone is the only account detail. A reset always targets the
 * account's known baseline password (from .env), so there is no second password to protect.
 *
 * An OPEN journal entry (pending or applied), an unreadable journal file, or an app-state marker
 * blocks the next account run (see account-preflight.ts). Nothing here closes an entry by
 * itself: only the QA owner does, through closeByOwner() after checking the account.
 */
export const ACCOUNT_STATE_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'reports',
  'ios-account-state',
);

export type JournalState = 'pending' | 'applied' | 'restored' | 'closed';
export type JournalOperation = 'password-reset-to-baseline' | 'invalid-password-attempts';
const OPERATIONS: readonly JournalOperation[] = [
  'password-reset-to-baseline',
  'invalid-password-attempts',
];
/**
 * Every attempts entry has its OWN journal file and id (`<run>-attempts-<n>`): a later series never replaces an
 * earlier one, and neither ever replaces the run's reset entry.
 */
export const attemptsRunId = (runId: string, n = 1) => `${runId}-attempts-${n}`;
/** Evidence found AFTER the attempts were closed as unchanged (see RecoveryJournal.recordLateSignIn). */
export const lateSignInRunId = (runId: string) => `${runId}-late-signin`;

export interface JournalEntry {
  runId: string;
  role: 'dealer';
  /** First character, asterisks, last two digits. Never the full number. */
  maskedPhone: string;
  /**
   * What was about to happen: a password reset to the account's baseline password, or a series of INVALID
   * password attempts (values the backend is expected to reject). Only a completed reset counts as evidence of
   * the baseline: an attempts entry never does, whatever its state.
   */
  operation: JournalOperation;
  state: JournalState;
  createdAt: string;
  updatedAt: string;
  closedBy?: string;
  note?: string;
}

const ALLOWED: Record<JournalState, readonly JournalState[]> = {
  pending: ['applied', 'restored', 'closed'],
  applied: ['restored', 'closed'],
  restored: [],
  closed: [],
};
const RUN_ID = /^[A-Za-z0-9_-]{6,64}$/;
const ENTRY_KEYS = new Set([
  'runId',
  'role',
  'maskedPhone',
  'operation',
  'state',
  'createdAt',
  'updatedAt',
  'closedBy',
  'note',
]);

/** Masks a phone number for the journal and reports: first character and last two digits only. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s/g, '');
  if (digits.length < 6) return '[too short to mask]';
  return `${digits[0]}${'*'.repeat(digits.length - 3)}${digits.slice(-2)}`;
}

function writeFileSecure(file: string, content: string): void {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

function validEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    Object.keys(entry).every((key) => ENTRY_KEYS.has(key)) &&
    typeof entry.runId === 'string' &&
    RUN_ID.test(entry.runId) &&
    entry.role === 'dealer' &&
    typeof entry.maskedPhone === 'string' &&
    (OPERATIONS as readonly unknown[]).includes(entry.operation) &&
    typeof entry.state === 'string' &&
    entry.state in ALLOWED &&
    typeof entry.createdAt === 'string' &&
    typeof entry.updatedAt === 'string'
  );
}

export class RecoveryJournal {
  constructor(
    readonly dir: string = ACCOUNT_STATE_DIR,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private file(runId: string): string {
    if (!RUN_ID.test(runId)) throw new Error('The run id is not valid for a journal file name.');
    return path.join(this.dir, `journal-${runId}.json`);
  }

  /** Every entry, plus the names of journal files that could not be read or validated. */
  list(): { entries: JournalEntry[]; unreadable: string[] } {
    const entries: JournalEntry[] = [];
    const unreadable: string[] = [];
    if (!fs.existsSync(this.dir)) return { entries, unreadable };
    for (const name of fs.readdirSync(this.dir).filter((n) => /^journal-.*\.json$/.test(n))) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
        if (validEntry(parsed)) entries.push(parsed);
        else unreadable.push(name);
      } catch {
        unreadable.push(name);
      }
    }
    return { entries, unreadable };
  }

  /** Entries that still need recovery: pending or applied. */
  openEntries(): JournalEntry[] {
    return this.list().entries.filter((e) => e.state === 'pending' || e.state === 'applied');
  }

  /**
   * Whether a password reset to the baseline was COMPLETED on this machine (a 'restored' entry): the
   * only evidence that the account's current password is the baseline from .env. Fails closed (false)
   * on any unreadable journal file. It does not match the entry to the configured phone (a masked
   * phone only), and an owner who changes the password by hand must close or archive the journal.
   */
  baselineEstablished(): boolean {
    const { entries, unreadable } = this.list();
    return (
      unreadable.length === 0 &&
      entries.some((e) => e.operation === 'password-reset-to-baseline' && e.state === 'restored')
    );
  }

  /** The reason account runs are blocked by the journal, or undefined. Fails closed. */
  problem(): string | undefined {
    const { unreadable } = this.list();
    const open = this.openEntries();
    if (unreadable.length) {
      return `The recovery journal has unreadable file(s) (${unreadable.join(', ')}): account tests are blocked until the QA owner checks the account and removes or repairs them.`;
    }
    if (open.length) {
      const e = open[0];
      return `A recovery journal entry is open (run ${e.runId}, ${e.state}, since ${e.createdAt}, account ${e.maskedPhone}): account tests are blocked until the QA owner recovers the account and closes it.`;
    }
    return undefined;
  }

  /** Records that a password reset is about to be submitted. Refuses while another is open. */
  begin(runId: string, maskedPhone: string): JournalEntry {
    const blocked = this.problem();
    if (blocked) throw new Error(blocked);
    const at = this.now().toISOString();
    const entry: JournalEntry = {
      runId,
      role: 'dealer',
      maskedPhone,
      operation: 'password-reset-to-baseline',
      state: 'pending',
      createdAt: at,
      updatedAt: at,
    };
    writeFileSecure(this.file(runId), `${JSON.stringify(entry, null, 2)}\n`);
    return entry;
  }

  /**
   * Records that INVALID password attempts are about to be submitted, in a NEW entry (never replacing one).
   * Refuses while another entry is open. 'applied' later means a password MAY have been saved (the step was
   * left, or the attempt did not finish); 'restored' means the account was observed unchanged. Neither is ever
   * evidence of the baseline.
   */
  beginAttempts(runId: string, maskedPhone: string): JournalEntry {
    const blocked = this.problem();
    if (blocked) throw new Error(blocked);
    const earlier = this.list().entries.filter((e) =>
      e.runId.startsWith(`${runId}-attempts-`),
    ).length;
    const id = attemptsRunId(runId, earlier + 1);
    const at = this.now().toISOString();
    const entry: JournalEntry = {
      runId: id,
      role: 'dealer',
      maskedPhone,
      operation: 'invalid-password-attempts',
      state: 'pending',
      createdAt: at,
      updatedAt: at,
    };
    writeFileSecure(this.file(id), `${JSON.stringify(entry, null, 2)}\n`);
    return entry;
  }

  /**
   * Moves an attempts entry (by its own id) to applied (a password may have been saved) or restored (observed
   * unchanged). 'restored' is only ever reached from 'pending': an 'applied' entry is closed by the QA owner
   * after checking the account, never by a run.
   */
  markAttempts(entryRunId: string, state: 'applied' | 'restored', note?: string): JournalEntry {
    const current = this.list().entries.find((e) => e.runId === entryRunId);
    if (current?.operation !== 'invalid-password-attempts') {
      throw new Error(`Journal entry ${entryRunId} is not an invalid-password-attempts entry.`);
    }
    if (state === 'restored' && current.state !== 'pending') {
      throw new Error(
        `Journal entry ${entryRunId} is ${current.state}: only a pending attempts entry can be marked unchanged; the QA owner closes the others.`,
      );
    }
    return this.transition(entryRunId, state, { note });
  }

  /**
   * Evidence that arrived AFTER the attempts were observed to be rejected: the app turned out to be signed in
   * although the run did not expect it (a save that came back late signs the app in). It is a NEW, open
   * 'applied' entry (the closed ones stay as they are) so the next runs are blocked until the QA owner checks
   * the account. Nothing is recorded when the run made no attempts, or when it already holds this evidence.
   */
  recordLateSignIn(runId: string): JournalEntry | undefined {
    const { entries } = this.list();
    const attempts = entries.filter((e) => e.runId.startsWith(`${runId}-attempts-`));
    const id = lateSignInRunId(runId);
    if (!attempts.length || entries.some((e) => e.runId === id)) return undefined;
    const at = this.now().toISOString();
    const entry: JournalEntry = {
      runId: id,
      role: 'dealer',
      maskedPhone: attempts[0].maskedPhone,
      operation: 'invalid-password-attempts',
      state: 'applied',
      createdAt: at,
      updatedAt: at,
      note: 'The app was found signed in after invalid password attempts that were observed to be rejected: one of them may have been saved late. Check the account before closing this entry.',
    };
    writeFileSecure(this.file(id), `${JSON.stringify(entry, null, 2)}\n`);
    return entry;
  }

  /** Moves an entry along pending, applied, restored. Other transitions throw. */
  mark(runId: string, state: 'applied' | 'restored', note?: string): JournalEntry {
    return this.transition(runId, state, { note });
  }

  /** QA owner only: closes an open entry after checking the account. Never called by the tests. */
  closeByOwner(runId: string, by: string, note?: string): JournalEntry {
    if (!by.trim()) throw new Error('closeByOwner needs the name of the QA owner.');
    return this.transition(runId, 'closed', { closedBy: by.trim(), note });
  }

  private transition(
    runId: string,
    state: JournalState,
    extra: { note?: string; closedBy?: string },
  ): JournalEntry {
    const current = this.list().entries.find((e) => e.runId === runId);
    if (!current) throw new Error(`No journal entry for run ${runId}.`);
    if (!ALLOWED[current.state].includes(state)) {
      throw new Error(`Journal run ${runId}: ${current.state} cannot change to ${state}.`);
    }
    const next: JournalEntry = {
      ...current,
      state,
      updatedAt: this.now().toISOString(),
      ...(extra.note ? { note: extra.note.slice(0, 300) } : {}),
      ...(extra.closedBy ? { closedBy: extra.closedBy } : {}),
    };
    writeFileSecure(this.file(runId), `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}

/**
 * Marks that a run ended with the app not in guest state (cleanup failed or was not allowed).
 * While it exists, account runs are blocked. It is cleared only by a successful guest-state check
 * (guest-state.ts), never by time or by a later run starting.
 */
export class AppStateMarker {
  constructor(
    readonly dir: string = ACCOUNT_STATE_DIR,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get file(): string {
    return path.join(this.dir, 'APP-NOT-GUEST.json');
  }

  write(reason: string): void {
    writeFileSecure(
      this.file,
      `${JSON.stringify({ at: this.now().toISOString(), reason: reason.slice(0, 300) }, null, 2)}\n`,
    );
  }

  exists(): boolean {
    return fs.existsSync(this.file);
  }

  problem(): string | undefined {
    return this.exists()
      ? 'A previous account run left the app not in guest state (APP-NOT-GUEST.json): account tests are blocked until the app is back in guest state.'
      : undefined;
  }

  clear(): void {
    fs.rmSync(this.file, { force: true });
  }
}
