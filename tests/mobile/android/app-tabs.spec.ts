import { expect, test } from '@fixtures/mobile.fixture';
import type { MainTab } from '@mobile/screens/app-shell.screen';
import type { Language } from '@typings';
import { languageOptions, mobileAppText } from '@test-data/mobile-app.data';

// One device, so the whole file runs in order on a single Appium session. Each language block
// switches the app language first (More → Language), then checks the tabs as a guest.
test.describe.configure({ mode: 'serial' });

const languages: Language[] = ['en', 'ar'];

for (const lang of languages) {
  const text = mobileAppText[lang];

  test.describe(`Mazad Android app (${lang})`, () => {
    test('Language switch shows the bottom navigation in the chosen language', async ({
      appShell,
    }) => {
      await appShell.waitUntilReady();
      await appShell.setLanguage(lang, languageOptions);

      for (const tab of Object.keys(text.bottomNav) as MainTab[]) {
        expect.soft(await appShell.tabLabel(tab), `${tab} label`).toBe(text.bottomNav[tab]);
      }
      expect(await appShell.isSelected('home')).toBe(true);
    });

    test('My Bids shows the configured tabs and the guest message from the API', async ({
      appShell,
      myBidsScreen,
      mazadApi,
    }) => {
      const { body } = await mazadApi.getConfiguration(lang);
      const tabs = body.data.my_bids;

      await appShell.open('my_bids');

      expect(await appShell.isSelected('my_bids')).toBe(true);
      await expect.poll(() => myBidsScreen.byText(text.myBidsTitle).isDisplayed()).toBe(true);
      for (const tab of tabs) {
        expect
          .soft(await myBidsScreen.subTab(tab.tab_text).isDisplayed(), `tab "${tab.tab_text}"`)
          .toBe(true);
      }
      const guest = tabs[0]?.empty?.guest;
      expect(await myBidsScreen.message(guest?.title ?? '').isDisplayed()).toBe(true);
      expect(await myBidsScreen.button(guest?.button_label ?? '').isDisplayed()).toBe(true);
    });

    test('My Bids Won tab shows the guest message to a signed-out user', async ({
      appShell,
      myBidsScreen,
      mazadApi,
    }) => {
      const { body } = await mazadApi.getConfiguration(lang);
      const won = body.data.my_bids.find((t) => t.tab === 'won');
      expect(won, 'configuration has a Won tab').toBeDefined();

      await appShell.open('my_bids');
      await myBidsScreen.openSubTab(won?.tab_text ?? '');

      expect(await myBidsScreen.message(won?.empty?.guest?.title ?? '').isDisplayed()).toBe(true);
    });

    test('My Actions shows its tabs and asks a guest to log in', async ({
      appShell,
      myActionsScreen,
    }) => {
      await appShell.open('my_actions');

      expect(await appShell.isSelected('my_actions')).toBe(true);
      expect(await myActionsScreen.tabBar.isDisplayed()).toBe(true);
      expect
        .soft(await myActionsScreen.subTab(text.myActions.actionNeeded).isDisplayed())
        .toBe(true);
      expect.soft(await myActionsScreen.subTab(text.myActions.pending).isDisplayed()).toBe(true);
      expect(await myActionsScreen.guestPanel.isDisplayed()).toBe(true);
      expect(await myActionsScreen.message(text.myActions.guestMessage).isDisplayed()).toBe(true);
      expect(await myActionsScreen.loginButton.getText()).toBe(text.myActions.login);
    });

    test('Notifications show their tabs and the guest message from the API', async ({
      appShell,
      notificationsScreen,
      mazadApi,
    }) => {
      const { body } = await mazadApi.getConfiguration(lang);
      const guest = body.data.notification[0]?.empty?.guest;

      await appShell.open('my_actions');
      await appShell.notificationsButton.click();
      await notificationsScreen.tabBar.waitForDisplayed({ timeout: 15_000 });
      await notificationsScreen.dismissEnablePrompt();

      expect(await notificationsScreen.byText(text.notifications.title).isDisplayed()).toBe(true);
      expect
        .soft(await notificationsScreen.subTab(text.notifications.mine).isDisplayed())
        .toBe(true);
      expect
        .soft(await notificationsScreen.subTab(text.notifications.mazad).isDisplayed())
        .toBe(true);
      expect(await notificationsScreen.message(guest?.title ?? '').isDisplayed()).toBe(true);
      expect(await notificationsScreen.loginOrRegisterButton.getText()).toBe(guest?.button_label);

      await notificationsScreen.close();
    });

    test('Signed-in buyer sees won auctions in My Bids and their steps in My Actions', ({
      buyer,
    }) => {
      // Needs a buyer test account that has won an auction; the buyer fixture skips without one.
      void buyer;
      test.fixme(
        true,
        'Blocked: logged-in app login flow not yet automated (needs a buyer test account to record it).',
      );
    });
  });
}
