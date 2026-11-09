import { createHash } from 'node:crypto';
import {
  type AccountRunContext,
  type AccountRunKind,
  accountRunProblem,
  OTP_REQUEST_KINDS,
} from './account-preflight';
import {
  appendLedgerEntry,
  type LedgerEntry,
  LedgerError,
  type LedgerTarget,
  readLedger,
  safeName,
  TECHNICAL_LIMITS,
  technicalLimitProblem,
  VALID_OTP_MARKER_KIND,
} from './otp-ledger';

/**
 * The single-use OTP request permit. Nothing may tap Send on Forgot Password without one.
 *
 * - Issued only when every authorization check for the run kind passes (policy facts, account,
 *   journals, approvals and the switches, including MAZAD_ALLOW_OTP_REQUESTS). A policy that is
 *   complete does not issue one by itself: the switches the QA owner sets are part of the checks.
 * - Bound to one scenario, one run kind and one phone number (a digest, never logged or stored).
 * - CONSUMED BY AN ATTEMPT, for good: the moment `consume` is called on a genuine permit it is marked
 *   used, synchronously and before anything else, so a second or concurrent call always fails and a
 *   permit whose first attempt failed (wrong number, lapsed, no longer authorized, ledger problem)
 *   is never usable again. Consumption is atomic within the process (no await between the check
 *   and the mark) and across processes through the ledger lock (see otp-ledger.ts).
 * - The authorization is checked AGAIN at that moment, then the request is recorded in the durable
 *   ledger (under its lock, together with the limit checks) before the caller sends anything.
 * - Fails closed: a missing, forged, malformed, lapsed, reused or wrongly bound permit, and any
 *   missing, corrupted, unreadable or locked ledger, refuses.
 *
 * TWO KINDS OF LIMIT, kept apart and never mixed:
 * - TECHNICAL_LIMITS: this suite's own safety limits. They are NOT backend values and say nothing
 *   about what the backend allows. They only stop accidents (a loop, a repeated scenario).
 * - Recorded backend limits (config/ios-account-policy.ts): enforced from the ledger only when the
 *   QA owner has recorded them (maximum requests, window, cooldown). Never assumed.
 *
 * Nothing in this file sends an OTP.
 */
export class OtpAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpAuthorizationError';
  }
}

export { TECHNICAL_LIMITS, technicalLimitProblem };
export type OtpTarget = LedgerTarget;
export type OtpPathLedgerEntry = LedgerEntry;

/** A permit lapses this long after it was issued. */
export const PERMIT_LIFETIME_MS = 5 * 60_000;

const ISSUE = Symbol('otp-permit-issue');
const issued = new WeakSet<OtpRequestPermit>();
const scenariosIssued = new Set<string>();

const digest = (phone: string) =>
  createHash('sha256').update(phone.replace(/\D/g, '')).digest('hex');

export interface PermitDeps {
  ctx: AccountRunContext;
  /** Directory of the ledger (reports/ios-account-state). */
  ledgerDir: string;
  runId: string;
  now?: () => Date;
}

/** The ledger's entries, or an OtpAuthorizationError when it is missing, corrupted or unreadable. */
export function readOtpLedger(ledgerDir: string): LedgerEntry[] {
  try {
    return readLedger(ledgerDir);
  } catch (error) {
    throw new OtpAuthorizationError(error instanceof Error ? error.message : 'Ledger error.');
  }
}

/** Why the recorded BACKEND limits forbid one more request now (undefined = within them). */
export function otpLimitProblem(
  ctx: AccountRunContext,
  entries: readonly LedgerEntry[],
  now: Date,
): string | undefined {
  const { maxRequests, windowMinutes, cooldownSeconds } = ctx.policy.otp ?? {};
  if (!maxRequests || !windowMinutes || !cooldownSeconds) {
    return 'the recorded OTP limits (maximum requests, window, cooldown) are missing';
  }
  const times = entries
    .filter((e) => e.kind !== VALID_OTP_MARKER_KIND)
    .map((e) => Date.parse(e.at));
  const inWindow = times.filter((t) => now.getTime() - t < windowMinutes.value * 60_000);
  if (inWindow.length >= maxRequests.value) {
    return `the ledger already holds ${inWindow.length} OTP-path request(s) in the last ${windowMinutes.value} minute(s) (recorded maximum ${maxRequests.value})`;
  }
  const last = Math.max(0, ...times);
  if (last && now.getTime() - last < cooldownSeconds.value * 1000) {
    return `the last OTP-path request was less than the recorded ${cooldownSeconds.value} second(s) ago`;
  }
  return undefined;
}

function requestProblem(
  ctx: AccountRunContext,
  entries: readonly LedgerEntry[],
  runId: string,
  scenario: string,
  now: Date,
): string | undefined {
  const technical = technicalLimitProblem(entries, runId, scenario, now);
  if (technical) return technical;
  const recorded = otpLimitProblem(ctx, entries, now);
  return recorded ? `recorded backend limit: ${recorded}` : undefined;
}

export class OtpRequestPermit {
  #used = false;

  constructor(
    token: typeof ISSUE,
    readonly kind: AccountRunKind,
    readonly scenario: string,
    readonly target: OtpTarget,
    private readonly phoneDigest: string,
    private readonly issuedAt: Date,
    private readonly deps: PermitDeps,
  ) {
    if (token !== ISSUE) {
      throw new OtpAuthorizationError('A permit can only be issued by issueOtpRequestPermit.');
    }
    // Its binding (kind, scenario, target) cannot be changed afterwards.
    Object.freeze(this);
  }

  get used(): boolean {
    return this.#used;
  }

  /**
   * Consumes the permit for ONE request to `phone`. Synchronous on purpose: nothing can run
   * between the "already used" check and the mark. Throws, before anything is sent, when the permit
   * is not genuine, already used, malformed, lapsed, for another number, no longer authorized or
   * the ledger refuses. After the first attempt the permit is spent whatever the outcome.
   */
  consume(phone: unknown): void {
    if (!(this instanceof OtpRequestPermit) || !issued.has(this)) {
      throw new OtpAuthorizationError('Invalid OTP request permit.');
    }
    if (this.#used) {
      throw new OtpAuthorizationError(
        `The OTP request permit for "${this.scenario}" was already used.`,
      );
    }
    this.#used = true; // spent for good, before anything else can fail
    if (typeof phone !== 'string' || !phone.replace(/\D/g, '')) {
      throw new OtpAuthorizationError('The OTP request needs a phone number.');
    }
    const now = (this.deps.now ?? (() => new Date()))();
    if (now.getTime() - this.issuedAt.getTime() > PERMIT_LIFETIME_MS) {
      throw new OtpAuthorizationError(`The OTP request permit for "${this.scenario}" has lapsed.`);
    }
    if (digest(phone) !== this.phoneDigest) {
      throw new OtpAuthorizationError(
        `The OTP request permit for "${this.scenario}" is for another number.`,
      );
    }
    let problem: string | undefined;
    try {
      problem = accountRunProblem(this.kind, this.deps.ctx);
    } catch {
      problem = 'the authorization could not be checked';
    }
    if (problem) throw new OtpAuthorizationError(`OTP request refused at send time: ${problem}`);
    try {
      appendLedgerEntry(this.deps.ledgerDir, {
        runId: this.deps.runId,
        kind: this.kind,
        scenario: this.scenario,
        target: this.target,
        at: now,
        // Under the ledger lock: no other process can slip a request in between.
        check: (entries) =>
          requestProblem(this.deps.ctx, entries, this.deps.runId, this.scenario, now),
      });
    } catch (error) {
      throw new OtpAuthorizationError(
        `OTP request refused: ${error instanceof LedgerError || error instanceof Error ? error.message : 'ledger error'}`,
      );
    }
  }
}

/**
 * Issues the permit for ONE request, or throws. The caller passes the phone it will request for;
 * the permit is only good for that number.
 */
export function issueOtpRequestPermit(args: {
  kind: AccountRunKind;
  scenario: string;
  phone: string;
  target: OtpTarget;
  deps: PermitDeps;
}): OtpRequestPermit {
  const { kind, scenario, phone, target, deps } = args;
  if (!OTP_REQUEST_KINDS.includes(kind)) {
    throw new OtpAuthorizationError(`Run kind "${kind}" is not allowed to request an OTP.`);
  }
  const expectedTarget: OtpTarget =
    kind === 'unregistered-otp-request' ? 'unregistered' : 'registered';
  if (target !== expectedTarget) {
    throw new OtpAuthorizationError(
      `Run kind "${kind}" is for a ${expectedTarget} number, not a ${target} one.`,
    );
  }
  if (typeof phone !== 'string' || !phone.replace(/\D/g, '')) {
    throw new OtpAuthorizationError('An OTP request permit needs a phone number.');
  }
  if (!safeName(scenario) || !safeName(deps.runId)) {
    throw new OtpAuthorizationError(
      'An OTP request permit needs a plain scenario name and run id (letters, digits, . _ : -; no phone number).',
    );
  }
  const problem = accountRunProblem(kind, deps.ctx);
  if (problem) throw new OtpAuthorizationError(`OTP request permit refused: ${problem}`);

  const key = `${deps.runId}:${scenario}`;
  if (scenariosIssued.has(key)) {
    throw new OtpAuthorizationError(`A permit for "${scenario}" was already issued in this run.`);
  }
  const now = (deps.now ?? (() => new Date()))();
  // An early look so a run fails before the app is driven; the limits are checked again, under the
  // lock, when the permit is consumed.
  const limit = requestProblem(deps.ctx, readOtpLedger(deps.ledgerDir), deps.runId, scenario, now);
  if (limit) throw new OtpAuthorizationError(`OTP request permit refused: ${limit}.`);

  scenariosIssued.add(key);
  const permit = new OtpRequestPermit(ISSUE, kind, scenario, target, digest(phone), now, deps);
  issued.add(permit);
  return permit;
}

/**
 * Records in the ledger that a VALID OTP was entered (the app accepted it), which resets the count of
 * requests made without one (see TECHNICAL_LIMITS). Call it only after the app has shown the step that
 * follows a valid OTP. It is not an OTP request and sends nothing. Fails closed like every ledger write.
 */
export function recordValidOtpEntered(args: {
  scenario: string;
  target: OtpTarget;
  deps: Pick<PermitDeps, 'ledgerDir' | 'runId' | 'now'>;
}): void {
  const { scenario, target, deps } = args;
  if (!safeName(scenario) || !safeName(deps.runId)) {
    throw new OtpAuthorizationError('A valid-OTP marker needs a plain scenario name and run id.');
  }
  try {
    appendLedgerEntry(deps.ledgerDir, {
      runId: deps.runId,
      kind: VALID_OTP_MARKER_KIND,
      scenario: `${scenario}-valid`,
      target,
      at: (deps.now ?? (() => new Date()))(),
    });
  } catch (error) {
    throw new OtpAuthorizationError(
      `The valid-OTP marker could not be recorded: ${error instanceof Error ? error.message : 'ledger error'}`,
    );
  }
}
