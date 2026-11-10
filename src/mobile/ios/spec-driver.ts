import type { IosDriver } from '@mobile/ios/ios.session';

/**
 * The driver that SPECS and spec helpers receive (the `driver` fixture). It can restart the app,
 * read the page source for failure evidence and wait, and nothing else: no element lookup, no tap,
 * no typing, no other script. The screen objects get the real driver through the separate
 * `screenDriver` fixture, so every tap or typed value of an account action lives in a guarded screen
 * method (see action-guard.ts and otp-permit.ts).
 *
 * This is a RUNTIME barrier only for code that uses the fixture. It does not stop code that
 * deliberately imports the session functions and starts its own session; the source checks in
 * ui-tests/selfcheck/ios-interactions.selfcheck.spec.ts fail the build for that.
 */
export const SPEC_DRIVER_METHODS = ['getPageSource', 'pause', 'execute'] as const;

/** The only scripts a spec driver may run: the app restart pair used by restartIosApp. */
export const SPEC_DRIVER_SCRIPTS = ['mobile: terminateApp', 'mobile: launchApp'] as const;

export interface SpecDriver {
  getPageSource(): Promise<string>;
  pause(ms: number): Promise<void>;
  execute(script: string, ...args: unknown[]): Promise<unknown>;
}

export class SpecDriverDenied extends Error {
  constructor(what: string) {
    super(
      `The spec driver does not allow ${what}: account actions go through the guarded screen objects.`,
    );
    this.name = 'SpecDriverDenied';
  }
}

export function restrictDriver(raw: IosDriver): SpecDriver {
  const view: SpecDriver = {
    getPageSource: () => raw.getPageSource(),
    pause: (ms: number) => raw.pause(ms),
    execute: (script: string, ...args: unknown[]) => {
      if (!(SPEC_DRIVER_SCRIPTS as readonly string[]).includes(script)) {
        throw new SpecDriverDenied(`the script "${String(script)}"`);
      }
      return (raw.execute as (script: string, ...args: unknown[]) => Promise<unknown>)(
        script,
        ...args,
      );
    },
  };
  // Any other property is simply absent, so a lookup or tap is a TypeError, not a silent pass.
  return Object.freeze(view);
}
