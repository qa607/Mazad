import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@fixtures/ios.fixture';
import { inventory, type InventoryEntry } from '@mobile/ios/ios-inspection';
import { iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import { type IosElement, parseIosSource } from '@mobile/ios/page-source';
import { mobileAppText } from '@test-data/mobile-app.data';
import { allureLabels } from '@utils/allure-labels';
import { LOGOUT_BLOCKED } from '@utils/account-actions';
import { appStateMarker, runCauses } from './ios-account-helpers';
import { HOME_TABS, LANGUAGE_OPTIONS, MORE_TABS, openGuestLoginForm } from './ios-test-helpers';

/**
 * First SIGNED-IN inspection of the Dealer account (project ios-inspect; run it by file, only after the
 * QA owner has authorized the Dealer login run). It makes ONE login per language, through the central
 * guard (`loginScreen.login`, kind "login"), so it refuses unless every condition holds: the policy
 * facts and account confirmation, the account variables in .env, the approval switches
 * (IOS_ALLOW_ACCOUNT_ACTIONS and MAZAD_ALLOW_LOGOUT) and a known current password.
 *
 * It records the signed-in More screen: the labels of its Buttons and cells, with every other text
 * reported only by count (a signed-in screen can show the account's own name, which is never recorded),
 * and no screenshot. It then logs out ONLY when signing out is authorized (MAZAD_ALLOW_LOGOUT) and the
 * logout item is the one Button or cell whose label equals the known logout label; it never guesses.
 * When it cannot log out, it writes the app-state marker so the next account run is blocked until the
 * QA owner has checked the app (the account stays signed in on the phone).
 *
 * Nothing here changes the account: no password change, no OTP, no registration.
 * Output: reports/ios-inspection/signed-in-<language>.json (labels only, git-ignored).
 */
test.skip(
  Boolean(iosStaticProblem(process.env, { forInspection: true })),
  iosStaticProblem(process.env, { forInspection: true }),
);

const OUT_DIR = path.resolve(__dirname, '..', 'reports', 'ios-inspection');

const visible = (els: IosElement[]) => els.filter((e) => e.visible);
/**
 * The signed-in account header's label carries the account's name and phone number. A label holding a run
 * of 7 or more digits (a phone number) is replaced, whole, so no personal data reaches a report.
 */
const PERSONAL = /\d{7,}/;
const safeLabel = (label: string) =>
  PERSONAL.test(label) ? '[masked: the label holds personal data (digits)]' : label;
const labeled = (e: IosElement) => e.label || e.name;

for (const lang of ['en', 'ar'] as const) {
  test.describe(
    `iOS signed-in Dealer inspection (${lang})`,
    allureLabels({
      feature: 'Login',
      story: 'Signed-in inspection',
      severity: 'normal',
      platform: 'ios',
      language: lang,
    }),
    () => {
      test.use({ language: lang });

      test('logs in once, records the signed-in screen, logs out when authorized', async ({
        screenDriver: driver,
        iosConfig,
        appShell,
        loginScreen,
        iosDealerAccount,
        text,
      }, testInfo) => {
        test.setTimeout(300_000);
        const hints = mobileAppText[lang].loginFlow;
        const report: Record<string, unknown> = {
          language: lang,
          causesIfBlocked: runCauses('login'),
        };
        const entries = (els: IosElement[]): InventoryEntry[] => inventory(visible(els));
        const settle = () => driver.pause(1500);
        const write = async () => {
          fs.mkdirSync(OUT_DIR, { recursive: true });
          fs.writeFileSync(
            path.join(OUT_DIR, `signed-in-${lang}.json`),
            `${JSON.stringify(report, null, 2)}\n`,
          );
          await testInfo.attach('signed-in.json', {
            body: JSON.stringify(report, null, 2),
            contentType: 'application/json',
          });
        };

        const caps = driver.capabilities as Record<string, unknown>;
        const rawUdid = caps['appium:udid'] ?? caps.udid;
        const sessionUdid = typeof rawUdid === 'string' ? rawUdid : '';
        report.sessionUdid = sessionUdid;
        report.sessionUdidMatchesTheConfiguredIphone = sessionUdid === iosConfig.udid;
        if (sessionUdid !== iosConfig.udid) {
          await write();
          expect(sessionUdid, 'the session is on the configured iPhone').toBe(iosConfig.udid);
        }
        await restartIosApp(driver, iosConfig);
        await appShell.waitUntilReady(HOME_TABS);
        // An earlier run may have left the account signed in: then there is nothing to log in to.
        await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
        await appShell.openMore(text.tabs.more, text.tabs.home);
        const startedSignedIn = !(await appShell.guestPrompt(text.guestPrompt).isExisting());
        report.startedSignedIn = startedSignedIn;
        // IOS_LOGIN_LOGOUT_STRICT=true (the QA owner's run instructions): English must start from the signed-in
        // account (it completes the logout); Arabic must start signed out, so that its login is genuine.
        // Any other start: stop and report, do not improvise.
        if (process.env.IOS_LOGIN_LOGOUT_STRICT === 'true') {
          const expectedSignedIn = lang === 'en';
          if (startedSignedIn !== expectedSignedIn) {
            report.note = `Unexpected start state: the account was ${startedSignedIn ? 'signed in' : 'signed out'} at the start of the ${lang === 'en' ? 'English' : 'Arabic'} check; stopped as instructed (no login attempted).`;
            await write();
            expect(startedSignedIn, 'the start state is the expected one').toBe(expectedSignedIn);
            return;
          }
        }
        if (!startedSignedIn) {
          await openGuestLoginForm(appShell, loginScreen, lang, text);
          // THE login: the guard checks everything first and refuses (typing and tapping nothing) otherwise.
          await loginScreen.login(iosDealerAccount.phone, iosDealerAccount.password, {
            kind: 'login',
          });
          await settle();
          report.loginPerformedThroughTheGuard = true;
        }

        // Is the app signed in? More shows no guest prompt once it is.
        await appShell.openMore(text.tabs.more, text.tabs.home);
        await settle();
        const guestPromptStillShown = await appShell.guestPrompt(text.guestPrompt).isExisting();
        report.signedIn = !guestPromptStillShown;
        if (guestPromptStillShown) {
          report.note =
            'The guest prompt is still shown after the login: the app is not signed in (wrong password, a gate, or a slow response). Nothing was accepted or dismissed.';
          await write();
          expect(guestPromptStillShown, 'the login signed the app in').toBe(false);
          return;
        }

        // The logout item may be below the visible area: swipe up (at most 4 times) until a control with the
        // EXACT known label is visible. Only swipes; nothing is tapped. Not found: the run reports it and stops.
        const logoutLabelToFind = hints.logoutConfirm;
        let swipesUsed = 0;
        for (let i = 0; i < 4; i++) {
          const current = visible(parseIosSource(await driver.getPageSource()));
          if (current.some((e) => e.type !== 'StaticText' && labeled(e) === logoutLabelToFind))
            break;
          await driver.execute('mobile: swipe', { direction: 'up' });
          swipesUsed++;
          await driver.pause(900);
        }
        report.swipesUsedToFindTheKnownLogoutLabel = swipesUsed;
        await settle();
        const els = parseIosSource(await driver.getPageSource());
        const nonText = visible(els).filter((e) => e.type !== 'StaticText' && labeled(e));
        report.signedInMore = {
          labeledControls: nonText.map((e) => ({
            type: e.type,
            label: labeled(e),
            enabled: e.enabled,
          })),
          staticTextCount: visible(els).filter((e) => e.type === 'StaticText').length,
          inventory: entries(els)
            .filter((entry) => entry.type !== 'StaticText')
            .map((entry) => ({ ...entry, label: safeLabel(entry.label) })),
        };

        // Logout. Every shortfall below is a TEST FAILURE (the marker is kept and the state is reported):
        // a missing item, an unauthorized logout, a confirmation that is not exactly one visible match, a
        // sign-out that cannot be verified. Nothing is guessed and no positional selector is used.
        const logoutLabel = hints.logoutConfirm;
        report.logoutLabelUsed = logoutLabel;
        const fail = async (note: string, marker: string) => {
          report.completeFlow = false;
          report.finalAccountState = 'signed in (logout not completed)';
          report.note = note;
          appStateMarker.write(marker);
          await write();
          expect.soft(note, 'the logout flow completes').toBe('');
          throw new Error(note);
        };
        if (LOGOUT_BLOCKED) {
          report.logout = { attempted: false, reason: LOGOUT_BLOCKED };
          await fail(
            'Logout is not authorized (MAZAD_ALLOW_LOGOUT).',
            'Signed-in inspection ended while signed in: logout is not authorized.',
          );
        }
        const candidates = nonText.filter((e) => labeled(e) === logoutLabel);
        report.logoutItemMatchCount = candidates.length;
        if (candidates.length !== 1) {
          report.logout = { attempted: false };
          await fail(
            `${candidates.length} control(s) carry the exact known logout label; expected exactly 1.`,
            'Signed-in inspection ended while signed in: the logout item was not found.',
          );
        }
        const type = candidates[0].type;
        await driver
          .$(
            `-ios predicate string:type == "XCUIElementType${type}" AND label == ${JSON.stringify(logoutLabel)}`,
          )
          .click();
        await settle();
        const dialogEls = parseIosSource(await driver.getPageSource());
        report.logoutDialog = {
          buttons: visible(dialogEls)
            .filter((e) => e.type === 'Button' && labeled(e))
            .map((e) => safeLabel(labeled(e))),
          staticTextCount: visible(dialogEls).filter((e) => e.type === 'StaticText').length,
        };
        // The confirmation is a bottom SHEET (not an alert): exactly ONE visible Button with the exact
        // known label. Zero or several: fail and stop, nothing is tapped.
        const confirm = await driver
          .$$(
            `-ios predicate string:type == "XCUIElementTypeButton" AND label == ${JSON.stringify(logoutLabel)} AND visible == 1`,
          )
          .getElements();
        report.confirmationButtonMatchCount = confirm.length;
        if (confirm.length !== 1) {
          report.logout = { attempted: true, confirmed: false };
          await fail(
            `${confirm.length} visible confirmation button(s) carry the exact known label; expected exactly 1. Nothing was tapped.`,
            'Signed-in inspection: the logout confirmation was not found; the app is still signed in.',
          );
        }
        await confirm[0].click();
        report.confirmationTapped = true;
        // Positively verify the signed-out state: More shows the guest prompt (waits up to ~20 s).
        let guestAgain = false;
        for (let i = 0; i < 10 && !guestAgain; i++) {
          await driver.pause(2000);
          try {
            await appShell.openMore(text.tabs.more, text.tabs.home);
            guestAgain = await appShell.guestPrompt(text.guestPrompt).isExisting();
          } catch {
            guestAgain = false;
          }
        }
        report.logout = { attempted: true, confirmed: true, signedOutVerified: guestAgain };
        if (!guestAgain) {
          report.logout = { attempted: true, confirmed: true, signedOutVerified: false };
          await fail(
            'The confirmation was tapped but the signed-out state could not be verified.',
            'Signed-in inspection: the app did not return to the guest state after logout; check the account state.',
          );
        }
        // Only now, with the signed-out state positively verified, is the marker cleared.
        appStateMarker.clear();
        report.completeFlow = true;
        report.finalAccountState = 'signed out (verified: the guest prompt is shown)';
        await write();
      });
    },
  );
}
