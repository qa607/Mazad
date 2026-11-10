import { randomBytes } from 'node:crypto';
import { missingLocalEnv } from '@config/credentials.config';
import { ACCOUNT_TEST_POLICY } from '@config/ios-account-policy';
import type { AccountRunContext } from '@mobile/ios/account/account-preflight';
import type { OtpChainId } from '@mobile/ios/account/otp-chain';
import { AppStateMarker, RecoveryJournal } from '@mobile/ios/account/recovery-journal';

/**
 * The real context every account authorization check uses: the real policy, the process
 * environment (switches only: credentials are never read from it), the real journal and marker.
 * Lives in src so that the screens' guards need nothing from the spec layer. Reads names only.
 */

/** One id per process, used for the journal and the OTP ledger. */
export const RUN_ID = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;

export const accountJournal = new RecoveryJournal();
export const appStateMarker = new AppStateMarker();

export function accountContext(chainId?: OtpChainId): AccountRunContext {
  return {
    env: process.env,
    policy: ACCOUNT_TEST_POLICY,
    missingLocalEnv,
    journal: accountJournal,
    marker: appStateMarker,
    chainId,
  };
}
