import { favouriteCount, type ListedCar, pickUnfavouritedCar } from '@api/listed-car';
import type { MazadApiClient } from '@api/mazad-api.client';
import {
  type BackendAccount,
  getIosTestIndividual,
  IOS_TEST_INDIVIDUAL_MISSING_REASON,
} from '@config/credentials.config';
import { expect, test } from '@fixtures/ios.fixture';
import type { IosConfig } from '@mobile/ios/ios.config';
import { iosFavouritesBlocked, iosStaticProblem } from '@mobile/ios/ios-preflight';
import { restartIosApp } from '@mobile/ios/ios.session';
import type { SpecDriver } from '@mobile/ios/spec-driver';
import type { IosAccountScreen } from '@mobile/ios/screens/account.screen';
import type { IosAppShellScreen } from '@mobile/ios/screens/app-shell.screen';
import type { IosFavouritesScreen } from '@mobile/ios/screens/favourites.screen';
import type { IosLoginScreen } from '@mobile/ios/screens/login.screen';
import type { IosAppText } from '@test-data/ios-app.data';
import { GUEST_FORM_TEXT_SCOPE } from '@test-data/ios-verified-text';
import {
  favouriteCarRules,
  favouritesAppText,
  favouritesTestTitles,
} from '@test-data/mobile-favourites.data';
import { blockedBy, firstBlocked, LOGOUT_BLOCKED } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import type { Language } from '@typings';
import {
  attachFailureEvidence,
  HOME_TABS,
  LANGUAGE_OPTIONS,
  LANGUAGES,
  MORE_TABS,
  SERVER_RESPONSE_TIMEOUT,
} from './ios-test-helpers';

/**
 * Favourites on the iOS app: the same two scenarios as the Android suite
 * (tests/mobile/android/favourites.spec.ts), with any car the app already lists (picked from the
 * app API at run time; no car is created). The main scenario starts from a guest: the guest taps
 * the car's heart, signs in from the prompt it opens, and the car must then be in Favorite
 * Auctions. The second favourites the car while signed in, so a failure of the first can be told
 * apart from favourites not working at all.
 *
 * Own approval (QA owner, 2026-11-14), outside the account-run matrix: runs only when
 * IOS_ALLOW_FAVOURITES and MAZAD_ALLOW_LOGOUT are "true", and under every device, build and
 * narrow-text gate the other iOS tests need. Each test starts signed out (a signed-in app is logged
 * out first) and signs in once with the iOS Individual test account (IOS_TEST_INDIVIDUAL_* in
 * .env). The favourite is removed by the last step, or by the afterEach hook when a test fails
 * after adding it. Failure evidence is non-visual (attachFailureEvidence).
 */
const GATE = firstBlocked(
  iosStaticProblem(process.env, { textScope: GUEST_FORM_TEXT_SCOPE }),
  iosFavouritesBlocked(),
  LOGOUT_BLOCKED,
);

// One device: tests run one at a time, in order; a failure does not skip the next test, and a
// retry would sign in again.
test.describe.configure({ mode: 'default', retries: 0 });

const TEST_TIMEOUT = 300_000;

/** The car a test favourites, as the app lists it in the test's language. */
interface FavouriteCar extends ListedCar {
  /** The Favorite Auctions tab label (GET /v1/configuration). */
  favouritesTabLabel: string;
}

/** Any listed car that fits favouriteCarRules (see pickUnfavouritedCar), or null. */
async function pickListedCar(
  mazadApi: MazadApiClient,
  lang: Language,
): Promise<FavouriteCar | null> {
  const car = await pickUnfavouritedCar(mazadApi, lang, favouriteCarRules);
  if (!car) return null;
  const { body } = await mazadApi.getConfiguration(lang);
  const favouritesTab = body.data.favorite.find((t) => t.tab === car.tab);
  return favouritesTab ? { ...car, favouritesTabLabel: favouritesTab.tab_text } : null;
}

/** App: restarted, in the test's language, signed out, on More. */
async function startSignedOut(
  screens: {
    driver: SpecDriver;
    iosConfig: IosConfig;
    appShell: IosAppShellScreen;
    accountScreen: IosAccountScreen;
  },
  lang: Language,
  text: IosAppText,
): Promise<void> {
  const { driver, iosConfig, appShell, accountScreen } = screens;
  await restartIosApp(driver, iosConfig);
  await appShell.setLanguage(lang, LANGUAGE_OPTIONS, MORE_TABS, HOME_TABS);
  await appShell.openMore(text.tabs.more, text.tabs.home);
  if (await appShell.waitUntilMoreDisplayed(text.guestPrompt, 3_000)) return;
  await accountScreen.logout(text.logoutConfirm, text.logoutBack);
  expect(
    await appShell.waitUntilMoreDisplayed(text.guestPrompt, SERVER_RESPONSE_TIMEOUT),
    'More shows the guest prompt after logging out',
  ).toBe(true);
}

/** On the open login form: types the account and logs in once, closing one-time prompts. */
async function logIn(
  loginScreen: IosLoginScreen,
  account: BackendAccount,
  text: IosAppText,
): Promise<void> {
  await loginScreen.enterFavouritesLogin(account.phone, account.password);
  // Compared as a boolean so the number never appears in the report.
  const phoneTyped = (await loginScreen.phoneDigits()) === account.phone.replace(/\D/g, '');
  expect(phoneTyped, 'the whole phone number is in the field').toBe(true);
  await loginScreen.submitFavouritesLogin();
  await loginScreen.phoneInput.waitForExist({ reverse: true, timeout: SERVER_RESPONSE_TIMEOUT });
  await loginScreen.dismissNativeSavePasswordPrompt();
  await loginScreen.dismissPromptIfPresent(text.fingerprintPromptDismiss);
}

/** Favorite Auctions (from the Bids tab), on the car's tab. */
async function openFavouritesTab(
  favouritesScreen: IosFavouritesScreen,
  car: FavouriteCar,
  lang: Language,
  text: IosAppText,
): Promise<void> {
  await favouritesScreen.openFromBids(text.bidsTab);
  await favouritesScreen.waitUntilOpen(favouritesAppText[lang].favouritesHeading);
  await favouritesScreen.openTab(car.favouritesTabLabel);
}

for (const lang of LANGUAGES) {
  const homeText = favouritesAppText[lang];
  const labels = allureLabels({
    feature: 'Favourites',
    story: 'Add a car to favourites',
    severity: 'normal',
    platform: 'ios',
    language: lang,
  });

  test.describe(
    `Favourites - iOS app (${lang})`,
    { tag: [...labels.tag, '@regression', '@mutates'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no session, app launch or account read while blocked.
      test.skip(Boolean(GATE), GATE);
      test.use({ language: lang });

      /** Set while the test account has the test's car in favourites; cleared once removed. */
      let pendingRemoval: FavouriteCar | null = null;

      test.afterEach(async ({ driver, iosConfig, appShell, favouritesScreen, text }, testInfo) => {
        await attachFailureEvidence(driver, testInfo);
        if (!pendingRemoval) return;
        // The test stopped after adding the car: take it off the account's favourites again.
        const car = pendingRemoval;
        pendingRemoval = null;
        await restartIosApp(driver, iosConfig);
        await appShell.waitUntilReady(HOME_TABS);
        await openFavouritesTab(favouritesScreen, car, lang, text);
        if (await favouritesScreen.card(car.title).isExisting()) {
          await favouritesScreen.removeFavourite(car.title);
        }
      });

      test(
        favouritesTestTitles.guest,
        { tag: '@functional', annotation: blockedBy(GATE) },
        async (
          {
            driver,
            iosConfig,
            appShell,
            homeScreen,
            loginScreen,
            accountScreen,
            favouritesScreen,
            mazadApi,
            guestTabsScreen,
            text,
          },
          testInfo,
        ) => {
          test.setTimeout(TEST_TIMEOUT);
          // Read here, once the iOS session is confirmed usable (never in a blocked or skipped test).
          const account = getIosTestIndividual();
          test.skip(!account, IOS_TEST_INDIVIDUAL_MISSING_REASON);
          if (!account) return; // Not reached: skip() ends the test.
          const car = await pickListedCar(mazadApi, lang);
          test.skip(
            !car,
            'No listed car fits favouriteCarRules (none without favourites, with a unique title and enough time left).',
          );
          if (!car) return; // Not reached: skip() ends the test.
          testInfo.annotations.push({
            type: 'car',
            description: `${car.title} (auction item ${car.id}, ${car.tab})`,
          });

          await test.step('guest: the car’s heart asks to log in', async () => {
            await startSignedOut({ driver, iosConfig, appShell, accountScreen }, lang, text);
            await guestTabsScreen.openTab(text.tabs.home);
            await homeScreen.openCars(homeText.homeTabs[car.tab], homeText.carsView);
            await homeScreen.tapFavourite(car.title);
            await expect
              .poll(() => loginScreen.loginChoice(text.entryChoiceLogin).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: 'the welcome sheet offers Log In',
              })
              .toBe(true);
          });

          await test.step('sign in from that prompt', async () => {
            await loginScreen.chooseLogin(text.entryChoiceLogin);
            await logIn(loginScreen, account, text);
          });

          await test.step('Favorite Auctions lists the car', async () => {
            await openFavouritesTab(favouritesScreen, car, lang, text);
            await expect
              .poll(() => favouritesScreen.card(car.title).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: `"${car.title}" is in Favorite Auctions > ${car.favouritesTabLabel}`,
              })
              .toBe(true);
            pendingRemoval = car;
            expect(await favouriteCount(mazadApi, car, lang), 'favourite count (API)').toBe(
              car.favourites + 1,
            );
          });

          await test.step('removing it takes it off Favorite Auctions', async () => {
            await favouritesScreen.removeFavourite(car.title);
            await expect
              .poll(() => favouritesScreen.card(car.title).isExisting(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: `"${car.title}" is no longer in Favorite Auctions`,
              })
              .toBe(false);
            pendingRemoval = null;
            await expect
              .poll(() => favouriteCount(mazadApi, car, lang), { message: 'favourite count (API)' })
              .toBe(car.favourites);
          });
        },
      );

      test(
        favouritesTestTitles.signedIn,
        { tag: '@functional', annotation: blockedBy(GATE) },
        async (
          {
            driver,
            iosConfig,
            appShell,
            homeScreen,
            loginScreen,
            accountScreen,
            favouritesScreen,
            mazadApi,
            guestTabsScreen,
            text,
          },
          testInfo,
        ) => {
          test.setTimeout(TEST_TIMEOUT);
          // Read here, once the iOS session is confirmed usable (never in a blocked or skipped test).
          const account = getIosTestIndividual();
          test.skip(!account, IOS_TEST_INDIVIDUAL_MISSING_REASON);
          if (!account) return; // Not reached: skip() ends the test.
          const car = await pickListedCar(mazadApi, lang);
          test.skip(
            !car,
            'No listed car fits favouriteCarRules (none without favourites, with a unique title and enough time left).',
          );
          if (!car) return; // Not reached: skip() ends the test.
          testInfo.annotations.push({
            type: 'car',
            description: `${car.title} (auction item ${car.id}, ${car.tab})`,
          });

          await test.step('sign in from More', async () => {
            await startSignedOut({ driver, iosConfig, appShell, accountScreen }, lang, text);
            await loginScreen.openLoginForm(text.guestPrompt, text.entryChoiceLogin);
            await loginScreen.waitForForm();
            await logIn(loginScreen, account, text);
          });

          await test.step('tap the car’s heart on Home', async () => {
            await guestTabsScreen.openTab(text.tabs.home);
            await homeScreen.openCars(homeText.homeTabs[car.tab], homeText.carsView);
            await homeScreen.tapFavourite(car.title);
          });

          await test.step('Favorite Auctions lists the car', async () => {
            await openFavouritesTab(favouritesScreen, car, lang, text);
            await expect
              .poll(() => favouritesScreen.card(car.title).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: `"${car.title}" is in Favorite Auctions > ${car.favouritesTabLabel}`,
              })
              .toBe(true);
            pendingRemoval = car;
            expect(await favouriteCount(mazadApi, car, lang), 'favourite count (API)').toBe(
              car.favourites + 1,
            );
          });

          await test.step('removing it takes it off Favorite Auctions', async () => {
            await favouritesScreen.removeFavourite(car.title);
            await expect
              .poll(() => favouritesScreen.card(car.title).isExisting(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: `"${car.title}" is no longer in Favorite Auctions`,
              })
              .toBe(false);
            pendingRemoval = null;
            await expect
              .poll(() => favouriteCount(mazadApi, car, lang), { message: 'favourite count (API)' })
              .toBe(car.favourites);
          });
        },
      );
    },
  );
}
