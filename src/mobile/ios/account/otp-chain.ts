import fs from 'node:fs';
import path from 'node:path';

/**
 * OTP chains for the iOS Forgot Password tests. A chain is ONE serial group of tests on the same
 * app session that shares exactly ONE OTP request. Chains are strictly separated by language,
 * and incorrect-OTP tests have their own chain (a wrong attempt may burn the OTP).
 *
 * Rules enforced here (and selfchecked):
 * - one OTP request per chain, made by its first step, never repeated;
 * - an OTP is entered once and never reused (a second entry throws);
 * - steps run in the declared order, none is skipped;
 * - after a failure the chain stops: no later step starts, nothing is retried;
 * - nothing here sends an OTP by itself: the caller passes the function that does.
 */
export type OtpChainId =
  'dealer-en-reset' | 'dealer-ar-flow' | 'dealer-en-incorrect-otp' | 'dealer-ar-incorrect-otp';

/** Test titles, exactly as declared in tests-ios/forgot-password.spec.ts. */
export const STEP = {
  otpStep: 'A registered phone opens the OTP step',
  // Read-only observations of the OTP screen (no OTP request, no entry, nothing typed).
  otpLayout: 'The OTP screen shows an input the suite supports',
  resendBlocked: 'Resend is not offered while the cooldown runs',
  emptyOtp: 'Empty OTP keeps Verify disabled',
  resendOffered: 'Resend is offered again once the cooldown has passed',
  correctOtp: 'The correct OTP opens the new-password step',
  newPasswordLayout: 'The new-password screen shows the one password field the suite supports',
  emptyPassword: 'Empty new password keeps Save and Login disabled',
  shortPassword: 'A new password below the confirmed minimum length is rejected',
  rejectedPassword: 'A new password the backend rejects is not saved',
  completeReset:
    'Saving the baseline password completes the reset and shows the confirmed post-reset state',
  incorrectOtp: 'Incorrect OTP is rejected',
} as const;

export interface OtpChainDefinition {
  id: OtpChainId;
  language: 'en' | 'ar';
  /** `negative` chains carry an account-lock risk and need their own approval. */
  kind: 'flow' | 'negative';
  /** Whether the chain's last step saves a new password (a password reset). */
  resetsPassword: boolean;
  /** Always exactly one. */
  otpRequests: 1;
  /** The tests this chain's single OTP request covers, in order. */
  steps: readonly string[];
}

const FLOW = [
  STEP.otpStep,
  STEP.otpLayout,
  STEP.resendBlocked,
  STEP.emptyOtp,
  STEP.resendOffered,
  STEP.correctOtp,
  STEP.newPasswordLayout,
  STEP.emptyPassword,
  STEP.shortPassword,
  STEP.rejectedPassword,
] as const;

/**
 * The approved structure: which tests each OTP request covers. English saves a password (the
 * reset, back to the account's known baseline); Arabic stops before saving.
 */
export const OTP_CHAINS: readonly OtpChainDefinition[] = [
  {
    id: 'dealer-en-reset',
    language: 'en',
    kind: 'flow',
    resetsPassword: true,
    otpRequests: 1,
    steps: [...FLOW, STEP.completeReset],
  },
  {
    id: 'dealer-ar-flow',
    language: 'ar',
    kind: 'flow',
    resetsPassword: false,
    otpRequests: 1,
    steps: FLOW,
  },
  {
    id: 'dealer-en-incorrect-otp',
    language: 'en',
    kind: 'negative',
    resetsPassword: false,
    otpRequests: 1,
    steps: [STEP.incorrectOtp],
  },
  {
    id: 'dealer-ar-incorrect-otp',
    language: 'ar',
    kind: 'negative',
    resetsPassword: false,
    otpRequests: 1,
    steps: [STEP.incorrectOtp],
  },
];

export function chainDefinition(id: OtpChainId): OtpChainDefinition {
  const def = OTP_CHAINS.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown OTP chain "${id}".`);
  return def;
}

export class OtpChain {
  readonly #steps: readonly string[];
  #next = 0;
  #requested = false;
  #entered = false;
  #failure: string | undefined;

  constructor(
    readonly def: OtpChainDefinition,
    /** Called once, just before the OTP request is made (audit trail). */
    private readonly onOtpRequested?: (def: OtpChainDefinition) => void,
  ) {
    this.#steps = def.steps;
  }

  get otpRequestCount(): number {
    return this.#requested ? 1 : 0;
  }

  get failure(): string | undefined {
    return this.#failure;
  }

  /** True once every step passed, or after a failure: nothing more may run in this chain. */
  get ended(): boolean {
    return this.#failure !== undefined || this.#next >= this.#steps.length;
  }

  /** Must be called at the start of a step; it must be the next step of the chain. */
  startStep(title: string): void {
    if (this.#failure !== undefined) {
      throw new Error(
        `Chain ${this.def.id} stopped after a failure (${this.#failure}); "${title}" is not run.`,
      );
    }
    if (this.#next >= this.#steps.length) {
      throw new Error(`Chain ${this.def.id} is complete; "${title}" is not part of it.`);
    }
    if (this.#steps[this.#next] !== title) {
      throw new Error(
        `Chain ${this.def.id}: expected step "${this.#steps[this.#next]}" next, not "${title}".`,
      );
    }
  }

  completeStep(title: string): void {
    if (this.#steps[this.#next] === title) this.#next++;
  }

  failStep(title: string, reason: string): void {
    this.#failure ??= `${title}: ${reason.slice(0, 200)}`;
  }

  /**
   * Makes the chain's ONE OTP request, from its first step only. The request counts as made
   * BEFORE it is sent: a failure while sending never allows a second request.
   */
  async requestOtp(send: () => Promise<void>): Promise<void> {
    if (this.#requested) {
      throw new Error(
        `Chain ${this.def.id} already requested its OTP; it is never requested twice.`,
      );
    }
    if (this.#next !== 0) {
      throw new Error(`Chain ${this.def.id}: the OTP is requested by the first step only.`);
    }
    this.#requested = true;
    this.onOtpRequested?.(this.def);
    await send();
  }

  /** Enters the chain's OTP, once. It counts as used BEFORE it is entered; never reused. */
  async enterOtp(enter: () => Promise<void>): Promise<void> {
    if (!this.#requested) throw new Error(`Chain ${this.def.id}: no OTP was requested yet.`);
    if (this.#entered) {
      throw new Error(`Chain ${this.def.id}: the OTP was already entered; it is never reused.`);
    }
    this.#entered = true;
    await enter();
  }

  /**
   * Runs one step: checks it is the next one, runs it, and records pass or failure. A failure
   * stops the chain and is rethrown unchanged (no retry).
   */
  async step(title: string, body: () => Promise<void>): Promise<void> {
    this.startStep(title);
    try {
      await body();
    } catch (error) {
      this.failStep(title, error instanceof Error ? error.message : String(error));
      throw error;
    }
    this.completeStep(title);
  }
}

/** One audit line per OTP request (timestamps only, no phone, no code). */
export function appendOtpLedger(
  dir: string,
  def: OtpChainDefinition,
  runId: string,
  at: Date,
): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'otp-requests.jsonl');
  fs.appendFileSync(file, `${JSON.stringify({ at: at.toISOString(), chain: def.id, runId })}\n`, {
    mode: 0o600,
  });
}
