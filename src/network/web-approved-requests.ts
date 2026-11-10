import { websiteLoginData } from '@test-data/website-login.data';
import type { BodyRule } from './request-body';
import type { ApprovedRequest } from './request-guard';
import {
  LOGOUT_BLOCKED,
  OTP_REQUEST_BLOCKED,
  PASSWORD_RESET_BLOCKED,
} from '@utils/account-actions';

/** Which approval switch (src/utils/account-actions.ts) an endpoint needs, if any. */
export type ApprovalSwitch = 'otp-request' | 'password-reset' | 'logout';

export interface WebApprovedRequest extends ApprovedRequest {
  /** Required for website entries: only the approved synthetic payload may pass. */
  body: BodyRule;
  /** Needed switch; undefined only for requests that change no account (e.g. a guest login attempt with an unregistered phone). */
  requires?: ApprovalSwitch;
  /** Who approved the entry and when, and how the path was recorded. */
  approval: string;
}

/**
 * Non-GET staging endpoints the Web functional tests may call. EMPTY: no endpoint has been
 * recorded and approved yet, so every POST/PUT/PATCH/DELETE from the website is blocked, and
 * the run halts on the first one. This includes the guest login attempt with an unregistered
 * phone and the Forgot Password request for an unregistered phone: their endpoint paths must
 * first be recorded (with all requests blocked) and approved by the QA owner.
 * Add entries only through code review.
 */
export const APPROVED_WEB_REQUESTS: readonly WebApprovedRequest[] = [];

/** The approved endpoints whose approval switch is on for this run. */
export function activeWebRequests(
  list: readonly WebApprovedRequest[],
  blocked: Record<ApprovalSwitch, string | undefined> = {
    'otp-request': OTP_REQUEST_BLOCKED,
    'password-reset': PASSWORD_RESET_BLOCKED,
    logout: LOGOUT_BLOCKED,
  },
): WebApprovedRequest[] {
  for (const r of list) {
    if (!r.body || !Object.keys(r.body.fields).length) {
      throw new Error(`Approved website request ${r.method} ${r.pathPrefix} has no body rule.`);
    }
  }
  return list.filter((r) => !r.requires || !blocked[r.requires]);
}

/**
 * Synthetic test values, by name, used to flag (never show) matching body fields in the guard's
 * log. Real account data is never listed here.
 */
export const WEB_SYNTHETIC_VALUES: Readonly<Record<string, string>> = {
  unregisteredPhone: websiteLoginData.unregisteredPhone,
  wrongPassword: websiteLoginData.wrongPassword,
  wrongOtp: websiteLoginData.wrongOtp,
  tooShortPassword: websiteLoginData.tooShortPassword,
};
