import { asDevRoot } from '@fixtures/test-customers';
import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  configColumns,
  configSettings,
  configText as text,
  configUrls,
  missingConfigPages,
  refusedStates,
  settingToFlip,
  steadySettings,
  unknownSettingNames,
} from '@test-data/config.data';

/**
 * Mazad Backend > Global Settings > Config, signed in as Dev Root: the page, its switches,
 * sorting, the missing create/view/delete, and saving a setting through the UI and the save
 * request. Only "Can Fail Item" is ever flipped (user's decision, 2026-11-12); every test that
 * changes it puts it back, and afterAll restores the value it had before the run.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);

const opposite = (state: 'ON' | 'OFF') => (state === 'ON' ? 'OFF' : 'ON');
const withoutFlipped = (states: Record<string, 'ON' | 'OFF'>) =>
  Object.fromEntries(steadySettings.map((setting) => [setting, states[setting]]));
const stateValue = (state: 'ON' | 'OFF') => (state === 'ON' ? '1' : '0');

test.describe('Config - page', { tag: ['@regression'] }, () => {
  test(
    'Global Settings > Config in the menu opens the page',
    { tag: ['@smoke', '@functional'] },
    async ({ page, configPage }) => {
      await configPage.goto();
      await configPage.openFromMenu();

      await expect(page).toHaveURL(configUrls.page);
      await expect(page).toHaveTitle(text.pageTitle);
      await expect(configPage.pageHeading).toHaveText(text.pageTitle);
      await expect(configPage.breadcrumbCurrent).toHaveText(text.pageTitle);
    },
  );

  test(
    'Shows one row with an ON/OFF switch for every setting',
    { tag: ['@smoke', '@ui'] },
    async ({ configPage }) => {
      await configPage.goto();

      expect(await configPage.headerTexts()).toEqual(['#', ...Object.values(configColumns)]);
      await expect(configPage.rows).toHaveCount(1);
      await expect(configPage.summary).toHaveText(/Showing 1-1 of 1 item\./);
      expect(await configPage.settingNames()).toEqual(configSettings);
      for (const setting of configSettings) {
        await expect(configPage.switchControl(setting), setting).toBeVisible();
        await expect(configPage.switchControl(setting), setting).toContainText('ON');
        await expect(configPage.switchControl(setting), setting).toContainText('OFF');
      }
    },
  );

  test('The switches show the stored values', { tag: ['@functional'] }, async ({ configPage }) => {
    await configPage.goto();
    for (const setting of steadySettings) {
      expect(await configPage.shownState(setting), setting).toBe(
        await configPage.storedState(setting),
      );
    }
  });

  test(
    'There is nothing to create, view or delete: no controls, and the pages answer 404',
    { tag: ['@negative'] },
    async ({ configPage }) => {
      await configPage.goto();
      await expect(configPage.rows).toHaveCount(1);
      await expect(configPage.recordControls).toHaveCount(0);
      for (const path of missingConfigPages) {
        expect(await configPage.routeStatus(path), path).toBe(404);
      }
    },
  );

  test(
    'Sorting by any column keeps the one row and its values',
    { tag: ['@functional'] },
    async ({ configPage }) => {
      await configPage.goto();
      const states = withoutFlipped(await configPage.shownStates());
      for (const setting of configSettings) {
        await test.step(`sort by ${configColumns[setting]}`, async () => {
          await configPage.goto();
          await configPage.sortBy(setting);
          await expect(configPage.rows).toHaveCount(1);
          expect(withoutFlipped(await configPage.shownStates())).toEqual(states);
        });
      }
    },
  );
});

test.describe(
  'Config - saving a setting (Can Fail Item only)',
  { tag: ['@regression', '@mutates'] },
  () => {
    test.describe.configure({ mode: 'serial', retries: 0 });
    let original: 'ON' | 'OFF';

    test.beforeAll(async ({ browser, pagesOn }) => {
      original = await asDevRoot(browser, pagesOn, async ({ configPage }) => {
        await configPage.goto();
        return configPage.storedState(settingToFlip);
      });
    });

    test.afterAll(async ({ browser, pagesOn }) => {
      await asDevRoot(browser, pagesOn, async ({ configPage }) => {
        await configPage.goto();
        if ((await configPage.storedState(settingToFlip)) !== original) {
          await configPage.saveSetting(settingToFlip, stateValue(original));
        }
      });
    });

    test(
      'Flipping the switch saves at once, confirms, and the value persists after refresh',
      { tag: ['@smoke', '@functional'] },
      async ({ page, configPage }) => {
        await configPage.goto();
        const others = withoutFlipped(await configPage.shownStates());

        for (const target of [opposite(original), original]) {
          await test.step(`switch to ${target}`, async () => {
            await configPage.flip(settingToFlip);
            await expect(configPage.resultTitle).toHaveText(text.saved);
            await expect(configPage.resultSuccessIcon).toBeVisible();
            await configPage.confirmResult();

            expect(await configPage.shownState(settingToFlip)).toBe(target);
            await page.reload();
            expect(await configPage.shownState(settingToFlip)).toBe(target);
            expect(await configPage.storedState(settingToFlip)).toBe(target);
          });
        }
        expect(withoutFlipped(await configPage.shownStates()), 'others unchanged').toEqual(others);
      },
    );

    test(
      'Closing the result with Escape keeps the switch in line with the stored value',
      { tag: ['@functional'] },
      async ({ page, configPage }) => {
        await configPage.goto();
        await configPage.flip(settingToFlip);
        await configPage.dismissResult();

        await expect(page).toHaveURL(configUrls.page);
        expect(await configPage.shownState(settingToFlip)).toBe(opposite(original));
        expect(await configPage.storedState(settingToFlip)).toBe(opposite(original));

        await configPage.saveSetting(settingToFlip, stateValue(original));
        expect(await configPage.storedState(settingToFlip)).toBe(original);
      },
    );

    test(
      'A saved value shows in another signed-in session',
      { tag: ['@functional'] },
      async ({ browser, pagesOn, configPage }) => {
        await configPage.goto();
        await configPage.saveSetting(settingToFlip, stateValue(opposite(original)));

        const shownElsewhere = await asDevRoot(browser, pagesOn, async ({ configPage: other }) => {
          await other.goto();
          return other.shownState(settingToFlip);
        });
        expect(shownElsewhere).toBe(opposite(original));

        await configPage.saveSetting(settingToFlip, stateValue(original));
      },
    );

    for (const { name, value } of refusedStates) {
      test(
        `A state of ${name} is refused and nothing changes`,
        { tag: ['@negative'] },
        async ({ configPage }) => {
          await configPage.goto();
          const result = await configPage.saveSetting(settingToFlip, value);

          expect(result.body).toMatchObject({ success: false, title: text.notSaved });
          expect(await configPage.storedState(settingToFlip)).toBe(original);
        },
      );
    }

    for (const { name, value } of unknownSettingNames) {
      test(`A save for ${name} is refused`, { tag: ['@negative'] }, async ({ configPage }) => {
        await configPage.goto();
        const result = await configPage.saveSetting(value, '0');

        expect(result.body).toMatchObject({ success: false, title: text.notSaved });
        expect(await configPage.storedState(settingToFlip)).toBe(original);
      });
    }

    test(
      'A save sent without the AJAX header or the CSRF token is refused',
      { tag: ['@negative'] },
      async ({ configPage }) => {
        await configPage.goto();
        const value = stateValue(opposite(original));

        const notAjax = await configPage.saveSetting(settingToFlip, value, { ajax: false });
        expect(notAjax.status).toBe(400);
        expect(notAjax.body?.message).toBe(text.ajaxOnly);

        const noCsrf = await configPage.saveSetting(settingToFlip, value, { csrf: false });
        expect(noCsrf.status).toBe(400);
        expect(noCsrf.body?.message).toBe(text.badCsrf);

        expect(await configPage.storedState(settingToFlip)).toBe(original);
      },
    );
  },
);
