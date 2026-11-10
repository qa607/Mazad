import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AccountActionNotAuthorized } from '../../src/mobile/ios/account/action-guard';
import { guardPasswordAttempts } from '../../src/mobile/ios/account/attempt-guard';
import { attemptsRunId, RecoveryJournal } from '../../src/mobile/ios/account/recovery-journal';
import { expect, test } from '../support/fixtures';

/**
 * The journal around INVALID password attempts (a temporary journal, no device): an attempt that was accepted
 * can never be lost or recorded as a plain failure, nor as a completed reset, and an attempts entry is never
 * evidence of the baseline password.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PHONE = 'a-made-up-number-0000000';
const RUN = 'run-attempts-001';

const withJournal = async (fn: (journal: RecoveryJournal, dir: string) => Promise<void> | void) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-attempts-'));
  try {
    await fn(new RecoveryJournal(dir, () => new Date('2026-11-09T10:00:00Z')), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};
const attemptEntries = (journal: RecoveryJournal) =>
  journal.list().entries.filter((e) => e.runId.startsWith(`${RUN}-attempts-`));
const entryOf = (journal: RecoveryJournal) => attemptEntries(journal)[0];

test.describe('iOS invalid password attempts are journaled (selfcheck)', () => {
  test('rejected: the entry is open DURING the attempts and unchanged afterwards', async () => {
    await withJournal(async (journal) => {
      let during: string | undefined;
      await guardPasswordAttempts({
        journal,
        runId: RUN,
        phone: PHONE,
        what: 'below-minimum password',
        run: () => {
          during = entryOf(journal)?.state;
          // While the attempt runs, every later account run is already blocked.
          expect(journal.problem()).toMatch(/entry is open/);
          return Promise.resolve();
        },
      });
      expect(during).toBe('pending');
      expect(entryOf(journal)).toMatchObject({
        operation: 'invalid-password-attempts',
        state: 'restored',
      });
      expect(journal.problem()).toBeUndefined();
    });
  });

  test('accepted or unfinished: the entry stays OPEN as applied, never restored and never a plain failure', async () => {
    await withJournal(async (journal) => {
      const boom = new Error('The new-password step was left');
      await expect(
        guardPasswordAttempts({
          journal,
          runId: RUN,
          phone: PHONE,
          what: 'rejected-password candidates',
          run: () => Promise.reject(boom),
        }),
      ).rejects.toBe(boom);
      const entry = entryOf(journal);
      expect(entry?.state).toBe('applied');
      expect(entry?.note).toMatch(/MAY have been saved/);
      expect(journal.problem()).toMatch(/entry is open \(run run-attempts-001-attempts-1, applied/);
      // The next run cannot begin anything until the QA owner closes it.
      expect(() => journal.begin('run-next-0001', 'masked')).toThrow(/entry is open/);
      expect(() => journal.beginAttempts('run-next-0001', 'masked')).toThrow(/entry is open/);
      journal.closeByOwner(attemptsRunId(RUN, 1), 'QA owner', 'password checked');
      expect(journal.problem()).toBeUndefined();
    });
  });

  test('a refused authorization is not an attempt: unchanged, and the refusal is rethrown', async () => {
    await withJournal(async (journal) => {
      const refusal = new AccountActionNotAuthorized(
        'Invalid password attempt refused: switch off.',
      );
      await expect(
        guardPasswordAttempts({
          journal,
          runId: RUN,
          phone: PHONE,
          what: 'below-minimum password',
          run: () => Promise.reject(refusal),
        }),
      ).rejects.toBe(refusal);
      expect(entryOf(journal)?.state).toBe('restored');
      expect(entryOf(journal)?.note).toMatch(/refused before anything was typed or sent/);
    });
  });

  test('an attempts entry is never evidence of the baseline, whatever its state', async () => {
    await withJournal(async (journal) => {
      expect(journal.baselineEstablished()).toBe(false);
      await guardPasswordAttempts({
        journal,
        runId: RUN,
        phone: PHONE,
        what: 'x',
        run: () => Promise.resolve(),
      });
      expect(entryOf(journal)?.state).toBe('restored');
      expect(journal.baselineEstablished()).toBe(false);
      // A completed RESET still is (the only evidence), and it does not replace the attempts entry.
      journal.begin(RUN, 'masked');
      journal.mark(RUN, 'applied');
      journal.mark(RUN, 'restored');
      expect(journal.baselineEstablished()).toBe(true);
      expect(
        journal
          .list()
          .entries.map((e) => e.operation)
          .sort(),
      ).toEqual(['invalid-password-attempts', 'password-reset-to-baseline']);
    });
  });

  test('the entry holds a masked phone and a note, never a password; files are owner-only', async () => {
    await withJournal(async (journal, dir) => {
      await guardPasswordAttempts({
        journal,
        runId: RUN,
        phone: PHONE,
        what: 'below-minimum password',
        run: () => Promise.resolve(),
      });
      const file = path.join(dir, `journal-${attemptsRunId(RUN, 1)}.json`);
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      const text = fs.readFileSync(file, 'utf8');
      expect(text).not.toContain(PHONE);
      expect(Object.keys(JSON.parse(text) as object).sort()).toEqual([
        'createdAt',
        'maskedPhone',
        'note',
        'operation',
        'role',
        'runId',
        'state',
        'updatedAt',
      ]);
    });
  });

  test('the cleanup that restores a RESET entry cannot touch an attempts entry', () => {
    const helpers = stripComments(read('tests-ios/ios-account-helpers.ts'));
    const body = helpers.slice(helpers.indexOf('export function markResetRestored'));
    expect(body.slice(0, body.indexOf('\n}\n'))).toContain('e.runId === RUN_ID');
    // The attempts run id is a different id by construction.
    expect(attemptsRunId(RUN, 1)).not.toBe(RUN);
    expect(helpers).not.toMatch(/markAttempts|attemptsRunId/);
  });

  test('a timed-out step ends its chain, so the cleanup still runs', () => {
    const spec = stripComments(read('tests-ios/forgot-password.spec.ts'));
    expect(spec).toContain("testInfo.status === 'timedOut'");
    expect(spec).toMatch(/chain\.failStep\(testInfo\.title, 'the test timed out'\)/);
    expect(spec.indexOf("testInfo.status === 'timedOut'")).toBeLessThan(
      spec.indexOf('if (!chain.ended) return;'),
    );
  });

  test('a later series never replaces an earlier one, and each entry has its own file', async () => {
    await withJournal(async (journal, dir) => {
      for (const what of ['first series', 'second series']) {
        await guardPasswordAttempts({
          journal,
          runId: RUN,
          phone: PHONE,
          what,
          run: () => Promise.resolve(),
        });
      }
      expect(
        attemptEntries(journal)
          .map((e) => e.runId)
          .sort(),
      ).toEqual([attemptsRunId(RUN, 1), attemptsRunId(RUN, 2)]);
      expect(
        attemptEntries(journal)
          .map((e) => e.note?.slice(0, 12))
          .sort(),
      ).toEqual(['first series', 'second serie']);
      expect(fs.readdirSync(dir).filter((n) => n.startsWith('journal-')).length).toBe(2);
    });
  });

  test('an applied attempts entry can never be marked unchanged by a run', async () => {
    await withJournal((journal) => {
      const entry = journal.beginAttempts(RUN, 'masked');
      journal.markAttempts(entry.runId, 'applied', 'saved?');
      expect(() => journal.markAttempts(entry.runId, 'restored')).toThrow(
        /only a pending attempts entry/,
      );
      expect(entryOf(journal)?.state).toBe('applied');
      expect(() => journal.markAttempts('no-such-entry-1', 'applied')).toThrow(
        /not an invalid-password-attempts entry/,
      );
    });
  });

  test('a reset entry is not an attempts entry: the attempts transitions refuse it', async () => {
    await withJournal((journal) => {
      journal.begin('run-reset-0002', 'masked');
      expect(() => journal.markAttempts('run-reset-0002', 'applied')).toThrow(
        /not an invalid-password-attempts entry/,
      );
    });
  });

  test('an open entry cannot be overwritten by a new begin of either kind', async () => {
    await withJournal((journal) => {
      journal.begin('run-reset-0003', 'masked');
      const before = fs.readFileSync(path.join(journal.dir, 'journal-run-reset-0003.json'), 'utf8');
      expect(() => journal.begin('run-reset-0003', 'other')).toThrow(/entry is open/);
      expect(() => journal.beginAttempts('run-reset-0003', 'other')).toThrow(/entry is open/);
      expect(fs.readFileSync(path.join(journal.dir, 'journal-run-reset-0003.json'), 'utf8')).toBe(
        before,
      );
      journal.mark('run-reset-0003', 'applied');
      expect(() => journal.begin('run-reset-0003', 'other')).toThrow(/entry is open/);
    });
  });

  test('late sign-in evidence is a NEW open entry; it needs earlier attempts and is recorded once', async () => {
    await withJournal(async (journal) => {
      // No attempts in this run: nothing to flag.
      expect(journal.recordLateSignIn(RUN)).toBeUndefined();
      await guardPasswordAttempts({
        journal,
        runId: RUN,
        phone: PHONE,
        what: 'below-minimum password',
        run: () => Promise.resolve(),
      });
      expect(journal.problem()).toBeUndefined();
      const late = journal.recordLateSignIn(RUN);
      expect(late).toMatchObject({ state: 'applied', operation: 'invalid-password-attempts' });
      expect(late?.maskedPhone).toBe(entryOf(journal)?.maskedPhone);
      expect(journal.recordLateSignIn(RUN)).toBeUndefined();
      // The closed entry is untouched, and the new one blocks every later run.
      expect(entryOf(journal)?.state).toBe('restored');
      expect(journal.problem()).toMatch(
        /entry is open \(run run-attempts-001-late-signin, applied/,
      );
      expect(journal.baselineEstablished()).toBe(false);
    });
  });

  test('the cleanup reports a sign-in after attempts only when the chain did not expect one', () => {
    const helpers = stripComments(read('tests-ios/ios-account-helpers.ts'));
    expect(helpers).toContain('signInExpected');
    expect(helpers).toContain('accountJournal.recordLateSignIn(RUN_ID)');
    const spec = stripComments(read('tests-ios/forgot-password.spec.ts'));
    expect(spec).toContain('signInExpected: chain.def.resetsPassword');
    // The window is three times the response window, with a last look at its end.
    expect(spec).toContain('const ATTEMPT_CONFIRM_MS = 3 * SERVER_RESPONSE_TIMEOUT;');
  });
});
