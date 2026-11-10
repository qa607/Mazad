import { AccountActionNotAuthorized } from './action-guard';
import { maskPhone, type RecoveryJournal } from './recovery-journal';

/**
 * Wraps a series of INVALID password attempts (values the backend is expected to reject) so that a wrongly
 * ACCEPTED value can never go unrecorded. The expectation is never trusted: before the first attempt the run
 * journals "attempts in progress" (pending), which blocks every later account run; the entry is only closed as
 * "unchanged" after `run` proved, positively, that nothing was saved.
 *
 * - `run` returns normally: it observed that every attempt was rejected (the step stayed on screen for the whole
 *   confirmation window) -> the entry becomes restored ("account observed unchanged").
 * - `run` throws because the authorization was refused: nothing was typed or sent -> restored, and the refusal
 *   is rethrown. A refusal is not an attempt.
 * - `run` throws anything else: the screen was left or the attempt did not finish, so a password MAY have been
 *   saved -> applied (open, blocks the next runs until the QA owner checks the account). It is never recorded as
 *   a plain failure, and never as a completed reset: an attempts entry is never evidence of the baseline.
 * The entry holds a masked phone and a short note; never a password.
 */
export async function guardPasswordAttempts(options: {
  journal: RecoveryJournal;
  runId: string;
  phone: string;
  /** What is attempted, in words (no value). */
  what: string;
  run: () => Promise<void>;
}): Promise<void> {
  const { journal, runId, phone, what, run } = options;
  const entryId = journal.beginAttempts(runId, maskPhone(phone)).runId;
  try {
    await run();
  } catch (error) {
    try {
      if (error instanceof AccountActionNotAuthorized) {
        journal.markAttempts(
          entryId,
          'restored',
          `${what}: refused before anything was typed or sent.`,
        );
      } else {
        journal.markAttempts(
          entryId,
          'applied',
          `${what}: the new-password step was left or the attempt did not finish; a password MAY have been saved. Check the account before closing this entry.`,
        );
      }
    } catch {
      // The original error matters more; the entry stays open (pending), which also blocks the next runs.
    }
    throw error;
  }
  journal.markAttempts(
    entryId,
    'restored',
    `${what}: the step stayed on screen; the account was observed unchanged.`,
  );
}
