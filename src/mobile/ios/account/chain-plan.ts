import { type OtpScreenText, otpScreenTextProblem } from '@test-data/ios-otp-screen.data';
import type { EffectiveChain } from './account-preflight';
import { STEP } from './otp-chain';

/**
 * The iOS OTP-screen text each chain step needs and that may not be recorded yet (see
 * test-data/ios-otp-screen.data.ts). A step whose text is missing stays declared as a PENDING test and no OTP
 * is spent on it. Pure: it reads no file, no environment and no device.
 */
export const STEP_SCREEN_TEXT: Readonly<Partial<Record<string, readonly (keyof OtpScreenText)[]>>> =
  {
    [STEP.resendBlocked]: ['resendControl'],
    [STEP.resendOffered]: ['resendControl'],
  };

/** A chain's effective steps plus the steps left out because their iOS screen text is not recorded. */
export interface ChainPlan extends EffectiveChain {
  /** Declared steps that stay PENDING (no OTP is spent on them): the text they need is not recorded. */
  pending: { step: string; reason: string }[];
}

/** The effective chain minus the steps that need iOS screen text nobody has recorded (see ChainPlan). */
export function planWithScreenText(
  effective: EffectiveChain,
  language: 'en' | 'ar',
  record?: Parameters<typeof otpScreenTextProblem>[2],
): ChainPlan {
  const pending: ChainPlan['pending'] = [];
  const steps = effective.steps.filter((step) => {
    const needed = STEP_SCREEN_TEXT[step];
    const reason = needed ? otpScreenTextProblem(language, needed, record) : undefined;
    if (reason) pending.push({ step, reason });
    return !reason;
  });
  return { ...effective, steps, pending };
}
