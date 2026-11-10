# iOS Simulator run workflow (Mazad Login and Forgot Password)

Simulator only; never the physical iPhone. Every step after "Prerequisites" needs the QA
owner's approval the first time it is done.

## Prerequisites

- The UI-test simulator build from the iOS team (`docs/ios-uitest-build-requirements.md`).
- Appium running (`APPIUM_URL`), NetBird connected (staging resolves on the Mac).
- A simulator UDID: `xcrun simctl list devices` (for example an iPhone on iOS 27).

## Steps

1. **Check the simulator** (read-only): `npm run ios:sim -- check <sim-udid>`
2. **Install the build:** `npm run ios:sim -- install <sim-udid> <path/to/App.app>`
   (prints the bundle ID, version and build).
3. **Allowlist that exact build** in `src/mobile/ios/ios.config.ts` (`APPROVED_IOS_BUILDS`,
   `target: 'simulator'`, bundle ID + version + build), through code review.
4. **Trust the test CA on this simulator only:** `npm run ios:sim -- trust-ca <sim-udid>`
5. **Environment** (in `.env` or the shell):
   `IOS_TARGET=simulator`, `IOS_SIM_UDID=<sim-udid>`, `IOS_BUNDLE_ID=<uitest bundle ID>`,
   `IOS_GUARD_PROXY=127.0.0.1:<free port>`.
6. **Guarded launch** (one launch, no UI interaction): after the NetBird administrator
   confirms the private staging IP and the DNS checks pass, boot the simulator yourself, then
   `IOS_STAGING_EXPECTED_IP=<confirmed IP> npm run ios:guarded-launch`.
   - Refuses before starting anything unless: simulator target and an existing, booted
     simulator UDID; the exact allowlisted bundle, version and build installed; the test CA
     present and valid; staging resolving on the Mac to exactly the confirmed IP; Appium ready;
     the proxy port free; every `MAZAD_ALLOW_*` / `IOS_ALLOW_*` switch off.
   - Then starts the guard, confirms it listens, starts the session (the app launches with
     `-MazadUITestProxy`), observes for `IOS_LAUNCH_OBSERVE_SECONDS` (default 30, 10 to 120;
     stops at the first unexpected request), and always terminates the app, closes the
     session and closes the guard.
   - Evidence: `reports/ios-guard/launch-<time>.json` (+ `.png`): prerequisites, resolved IP,
     every allowed and blocked request, cleanup. It passes only if the app reached staging,
     nothing unexpected was requested, and cleanup succeeded.
   - It changes no flag. With that evidence, the code review sets `verifiedOnDevice: true` and
     `IOS_NETWORK_GUARD_READY = true`.
7. **First inspection** (records selectors and text; nothing typed or submitted):
   `npm run test:ios:inspect`. Review `reports/ios-inspection/<lang>.json`:
   - `summary`: selectors (tab bar, guest prompt, Login, Forgot Password) without an id, not
     found, or ambiguous (more than one candidate), expected text not found, duplicate ids, and what the guest inspection cannot reach
     (`notInspectedSelectors` / `notInspectedTexts`, e.g. OTP and new-password steps);
   - `screens.<screen>`: proposals, text checks, interactive elements without an id
     (`missingIds`, to send to the iOS team), and the visible-element inventory.
     Page sources are attached with input values redacted. Nothing is recorded automatically:
     copy reviewed ids into `src/mobile/ios/ios-selectors.ts` (never an ambiguous one without a
     decision; an id must be the same in the English and Arabic reports), confirm
     `test-data/ios-app.data.ts`, then set `IOS_SELECTORS_VERIFIED` and `IOS_TEXT_VERIFIED` to
     true in code review.
8. **First run (guest scenarios only):** `npm run test:ios`. Account-changing tests stay
   skipped while the `MAZAD_ALLOW_*` / `IOS_ALLOW_*` switches are off.
9. **Afterwards:** `npm run ios:sim -- shutdown <sim-udid>`. Results: `reports/ios/html`, JUnit,
   and Allure (`allure-results/`).

## Safety recap

- No session starts while any gate fails (allowlist, installed build, guard, verification, text).
  The one exception is the guarded launch (step 6), which does not need the two verification
  flags it exists to justify, and has its own stricter prerequisites instead.
- The guard blocks every non-GET request (no iOS endpoint is approved) and halts on the first
  unexpected request; production hosts are refused before any TLS.
- The test CA is trusted by that simulator only; its key stays in `reports/ios-guard/ca`.
- Every relaunch between tests uses `mobile: launchApp` with `-MazadUITestProxy` (never
  `activateApp`, which would start the app without it and bypass the guard).
