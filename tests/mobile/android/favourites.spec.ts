import { favouriteCount, type ListedCar, pickUnfavouritedCar } from '@api/listed-car';
import type { MazadApiClient } from '@api/mazad-api.client';
import type { BackendAccount } from '@config/credentials.config';
import { expect, test } from '@fixtures/mobile.fixture';
import { type AndroidDriver, restartApp } from '@mobile/android.session';
import { ensureSignedOut } from '@mobile/ensure-signed-out';
import type { MazadAccountScreen } from '@mobile/screens/account.screen';
import type { AppShellScreen } from '@mobile/screens/app-shell.screen';
import type { FavouritesScreen } from '@mobile/screens/favourites.screen';
import type { HomeScreen } from '@mobile/screens/home.screen';
import type { MazadLoginScreen } from '@mobile/screens/login.screen';
import { languageOptions, mobileAppText } from '@test-data/mobile-app.data';
import {
  favouriteCarRules,
  favouritesAppText,
  favouritesTestTitles,
  guestFavouriteBug,
} from '@test-data/mobile-favourites.data';
import { blockedBy, LOGOUT_BLOCKED } from '@utils/account-actions';
import { allureLabels } from '@utils/allure-labels';
import type { Language } from '@typings';

// Favourites on the Android app, with any car the app already lists (picked from the app API at run
// time; no car is created). The main scenario starts from a guest: the guest taps the car's heart,
// signs in from the prompt it opens, and the car must then be in Favorite Auctions. The second test
// favourites the car while signed in, so a failure of the first can be told apart from favourites
// not working at all.
//
// Each test starts from a signed-out app, so a signed-in app is logged out first: skipped unless
// that is approved (MAZAD_ALLOW_LOGOUT=true). Signs in with the Android Individual test account
// (ANDROID_TEST_INDIVIDUAL_* in .env). The favourite is removed again by the last step, or by the
// afterEach hook when a test fails after adding it.

// No browser page is used: the device screenshot is attached on failure instead.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// One device: tests run one at a time, in order; a failure does not skip the next test.
test.describe.configure({ mode: 'default', retries: 0 });

/** Upper bound for the app to show what staging returns (NetBird can be slow). */
const SERVER_RESPONSE_TIMEOUT = 20_000;
const TEST_TIMEOUT = 240_000;

const languages: Language[] = ['en', 'ar'];

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

/** App: restarted, in the test's language, signed out. */
async function startSignedOut(
  screens: {
    driver: AndroidDriver;
    appShell: AppShellScreen;
    loginScreen: MazadLoginScreen;
    accountScreen: MazadAccountScreen;
  },
  lang: Language,
): Promise<void> {
  const { driver, appShell, loginScreen, accountScreen } = screens;
  const loginText = mobileAppText[lang].loginFlow;
  await restartApp(driver);
  await appShell.waitUntilReady();
  await appShell.dismissAnnouncement();
  await appShell.setLanguage(lang, languageOptions);
  await ensureSignedOut(
    appShell,
    loginScreen,
    accountScreen,
    loginText.guestPrompt,
    loginText.logoutConfirm,
  );
}

/** On the open login form: types the account and logs in, closing the one-time prompts. */
async function logIn(
  loginScreen: MazadLoginScreen,
  account: BackendAccount,
  lang: Language,
): Promise<void> {
  const loginText = mobileAppText[lang].loginFlow;
  await loginScreen.enterPhone(account.phone);
  // Compared as a boolean so the number never appears in the report.
  const phoneTyped = (await loginScreen.phoneDigits()) === account.phone.replace(/\D/g, '');
  expect(phoneTyped, 'the whole phone number is in the field').toBe(true);
  await loginScreen.enterPassword(account.password);
  await loginScreen.loginButton.click();
  await loginScreen.loginButton.waitForExist({ reverse: true, timeout: SERVER_RESPONSE_TIMEOUT });
  await loginScreen.dismissUpdatedTermsIfPresent();
  await loginScreen.dismissPromptIfPresent(loginText.fingerprintPromptDismiss);
}

/** Opens Favorite Auctions from Home, on the car's tab. */
async function openFavouritesTab(
  screens: { homeScreen: HomeScreen; favouritesScreen: FavouritesScreen },
  car: FavouriteCar,
  lang: Language,
): Promise<void> {
  const { homeScreen, favouritesScreen } = screens;
  const text = favouritesAppText[lang];
  await homeScreen.openFavourites(text.homeTabs.live);
  await favouritesScreen.waitUntilOpen(text.favouritesHeading);
  await favouritesScreen.openTab(car.favouritesTabLabel);
}

for (const lang of languages) {
  const text = favouritesAppText[lang];
  const loginText = mobileAppText[lang].loginFlow;
  const labels = allureLabels({
    feature: 'Favourites',
    story: 'Add a car to favourites',
    severity: 'normal',
    platform: 'android',
    language: lang,
  });

  test.describe(
    `Favourites - Android app (${lang})`,
    { tag: [...labels.tag, '@regression', '@mutates'], annotation: labels.annotation },
    () => {
      // Decided when the file loads: no Appium session or request runs while logging the app out
      // is not approved.
      test.skip(Boolean(LOGOUT_BLOCKED), LOGOUT_BLOCKED);

      /** Set while the test account has the test's car in favourites; cleared once removed. */
      let pendingRemoval: FavouriteCar | null = null;

      test.afterEach(async ({ driver, appShell, homeScreen, favouritesScreen }, testInfo) => {
        if (testInfo.status !== testInfo.expectedStatus) {
          const screenshot = await driver.takeScreenshot().catch(() => null);
          if (screenshot) {
            await testInfo.attach('device screenshot', {
              body: Buffer.from(screenshot, 'base64'),
              contentType: 'image/png',
            });
          }
        }
        if (!pendingRemoval) return;
        // The test stopped after adding the car: take it off the account's favourites again.
        const car = pendingRemoval;
        pendingRemoval = null;
        await restartApp(driver);
        await appShell.waitUntilReady();
        await appShell.open('home');
        await openFavouritesTab({ homeScreen, favouritesScreen }, car, lang);
        if (await favouritesScreen.favouriteButton(car.title).isExisting()) {
          await favouritesScreen.tapFavourite(car.title);
        }
      });

      test(
        favouritesTestTitles.guest,
        { tag: ['@functional', '@known-bug'], annotation: blockedBy(LOGOUT_BLOCKED) },
        async (
          {
            driver,
            appShell,
            homeScreen,
            loginScreen,
            accountScreen,
            favouritesScreen,
            mazadApi,
            androidIndividual,
          },
          testInfo,
        ) => {
          test.setTimeout(TEST_TIMEOUT);
          test.fail(true, guestFavouriteBug);
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
            await startSignedOut({ driver, appShell, loginScreen, accountScreen }, lang);
            await appShell.open('home');
            await homeScreen.openCars(text.homeTabs[car.tab], text.carsView);
            await homeScreen.tapFavourite(car.title);
            await expect
              .poll(() => loginScreen.loginChoice(loginText.entryChoiceLogin).isDisplayed(), {
                timeout: SERVER_RESPONSE_TIMEOUT,
                message: 'the welcome sheet offers Log In',
              })
              .toBe(true);
          });

          await test.step('sign in from that prompt', async () => {
            await loginScreen.chooseLogin(loginText.entryChoiceLogin);
            await logIn(loginScreen, androidIndividual, lang);
          });

          await test.step('Favorite Auctions lists the car', async () => {
            await openFavouritesTab({ homeScreen, favouritesScreen }, car, lang);
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
            await favouritesScreen.tapFavourite(car.title);
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
        { tag: '@functional', annotation: blockedBy(LOGOUT_BLOCKED) },
        async (
          {
            driver,
            appShell,
            homeScreen,
            loginScreen,
            accountScreen,
            favouritesScreen,
            mazadApi,
            androidIndividual,
          },
          testInfo,
        ) => {
          test.setTimeout(TEST_TIMEOUT);
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
            await startSignedOut({ driver, appShell, loginScreen, accountScreen }, lang);
            await loginScreen.openLoginForm(loginText.guestPrompt, loginText.entryChoiceLogin);
            await logIn(loginScreen, androidIndividual, lang);
          });

          await test.step('tap the car’s heart on Home', async () => {
            await appShell.open('home');
            await homeScreen.openCars(text.homeTabs[car.tab], text.carsView);
            await homeScreen.tapFavourite(car.title);
          });

          await test.step('Favorite Auctions lists the car', async () => {
            await openFavouritesTab({ homeScreen, favouritesScreen }, car, lang);
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
            await favouritesScreen.tapFavourite(car.title);
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
