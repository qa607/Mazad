import { expect, test } from '@fixtures/test.fixture';
import {
  type AdvertisementPlatform,
  advertisementPlatforms,
} from '@pages/backend/content/advertisement.page';
import {
  type AccessProfile,
  backendHomePath,
  expectedAccess,
  forbiddenStatus,
} from '@test-data/backend-permissions.data';
import {
  advertisementAccess,
  advertisementText,
  advertisementUrls,
} from '@test-data/backend-advertisement.data';

// Content > Advertisement (/backend/advertisement/advertisement/index): the banners customers
// see. Read-only: the Is Published switch is never touched (it changes what customers see), the
// Update form is opened without saving, and the Create form is only submitted empty. Then, who
// can manage advertisements.

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const platforms = Object.keys(advertisementPlatforms) as AdvertisementPlatform[];

test.describe('Backend - Advertisements', () => {
  test.use({ signedInAs: 'devRoot' });

  test.beforeEach(async ({ page, advertisementPage }) => {
    await advertisementPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(advertisementUrls.list);
    await expect(advertisementPage.rows.first(), 'No advertisement on staging.').toBeVisible();
  });

  test('Page shows the heading, Create button, filters and the advertisements grid', async ({
    page,
    advertisementPage: ads,
  }) => {
    await expect(page).toHaveTitle(advertisementText.pageTitle);
    await expect(ads.pageHeading).toHaveText(advertisementText.pageTitle);
    await expect(ads.breadcrumbCurrent).toHaveText(advertisementText.pageTitle);
    await expect(ads.sidebarLink).toHaveText(advertisementText.sidebarLabel);

    await expect(ads.createButton).toBeVisible();
    for (const input of [ads.idInput, ads.titleInput, ads.titleEnInput]) {
      await expect(input).toBeEditable();
    }
    await expect(ads.columnHeaders).toHaveText([...advertisementText.columnHeaders]);
    await expect(ads.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
  });

  test.describe('rows', () => {
    test('Every advertisement has View and Update, and a publish switch', async ({
      advertisementPage: ads,
    }) => {
      const count = await ads.rows.count();

      await expect(ads.rows.locator('a[href*="advertisement/view"]')).toHaveCount(count);
      await expect(ads.rows.locator('a[href*="advertisement/update"]')).toHaveCount(count);
      await expect(ads.rows.locator('input.update-advertisement-is-published')).toHaveCount(count);
    });

    test('Updated At is never before Created At', async ({ advertisementPage: ads }) => {
      const rows = await ads.readRows();

      expect(rows.filter((row) => row.updatedAt < row.createdAt).map((row) => row.id)).toEqual([]);
    });
  });

  test.describe('filters', () => {
    test('ID and titles find the advertisement', async ({ advertisementPage: ads }) => {
      const [first] = await ads.readRows();

      for (const [field, value] of [
        ['idInput', first.id],
        ['titleInput', first.title.split(' ')[0]],
        ['titleEnInput', first.titleEn.split(' ')[0]],
      ] as const) {
        await test.step(field, async () => {
          await ads.goto();
          await ads.searchBy(field, value);
          await expect(ads.row(first.id)).toHaveCount(1);
        });
      }
    });

    test('Platform: Both + Mobile + Web cover every advertisement', async ({
      advertisementPage: ads,
    }) => {
      const total = await ads.totalCount();
      let sum = 0;

      for (const platform of platforms) {
        await test.step(advertisementPlatforms[platform], async () => {
          await ads.gotoFiltered({ platform });
          sum += await ads.totalCount();
        });
      }

      expect(sum, 'advertisements across all platforms').toBe(total);
    });

    test('Platform filter in the form selects that platform', async ({
      advertisementPage: ads,
    }) => {
      await ads.filterByPlatform('both');

      await expect(ads.platformValue).toContainText(advertisementPlatforms.both);
    });

    test('The Platform filter offers "All" only once', async ({ advertisementPage: ads }) => {
      // Known gap (found 2026-11-10): the Platform filter lists "All" twice (the empty choice and
      // an "all" value). Remove test.fail() once it is listed once.
      test.fail(true, 'Known gap: the Platform filter lists "All" twice.');
      const labels = (await ads.platformOptions.allInnerTexts()).map((label) => label.trim());

      expect(labels.filter((label) => label === 'All')).toHaveLength(1);
    });

    test('Reset clears the filters', async ({ page, advertisementPage: ads }) => {
      const total = await ads.totalCount();
      await ads.gotoFiltered({ platform: 'web' });
      await ads.reset();

      await expect(page).toHaveURL(/\/backend\/advertisement\/advertisement\/index$/);
      expect(await ads.totalCount()).toBe(total);
    });
  });

  test('Click Count sorts ascending, then descending', async ({ advertisementPage: ads }) => {
    await ads.sortByClickCount();
    const ascending = (await ads.readRows()).map((row) => row.clickCount);
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

    await ads.sortByClickCount();
    const descending = (await ads.readRows()).map((row) => row.clickCount);
    expect(descending).toEqual([...descending].sort((a, b) => b - a));
  });

  test.describe('View and Update', () => {
    test('View shows the advertisement, its status matching the list', async ({
      page,
      advertisementPage: ads,
    }) => {
      const [first] = await ads.readRows();

      await page.goto(ads.viewPath(first.id));

      await expect(page).toHaveURL(advertisementUrls.view(first.id));
      await expect(ads.detailLabels).toHaveText([...advertisementText.viewLabels]);
      await expect(ads.detailValue('Title En')).toHaveText(first.titleEn);
      await expect(ads.detailValue('Click Count')).toHaveText(String(first.clickCount));
      await expect(ads.detailValue('Is Published')).toHaveText(first.isPublished ? 'Yes' : 'No');
    });

    test('Update opens the form filled with the advertisement (not saved)', async ({
      page,
      advertisementPage: ads,
    }) => {
      const [first] = await ads.readRows();

      await page.goto(ads.updatePath(first.id));

      await expect(page).toHaveURL(advertisementUrls.update(first.id));
      await expect(ads.formTitleInput).toHaveValue(first.title);
      await expect(ads.formTitleEnInput).toHaveValue(first.titleEn);
    });

    test('Every advertisement has a real end date', async ({ page, advertisementPage: ads }) => {
      // Known bug (found 2026-11-10): an advertisement's End Date reads "0000-00-00" (ID 2 on
      // staging), although End Date is required when creating one. Remove test.fail() once
      // every advertisement has a real end date.
      test.fail(true, 'Known bug: an advertisement has the end date 0000-00-00.');
      const ids = (await ads.readRows()).map((row) => row.id);

      for (const id of ids) {
        await page.goto(ads.viewPath(id));
        await expect(ads.detailValue('End Date'), `End Date of advertisement ${id}`).not.toHaveText(
          advertisementText.invalidDate,
        );
      }
    });
  });

  test('Create with empty fields is refused with every required field, and creates nothing', async ({
    page,
    advertisementPage: ads,
  }) => {
    const total = await ads.totalCount();
    await ads.createButton.click();
    await expect(page).toHaveURL(advertisementUrls.create);
    await expect(page).toHaveTitle(advertisementText.createTitle);

    await ads.formSubmitButton.click();

    for (const [inputId, message] of Object.entries(advertisementText.requiredFields)) {
      await expect(ads.fieldError(inputId)).toHaveText(message);
    }
    await expect(ads.formErrors).toHaveCount(Object.keys(advertisementText.requiredFields).length);
    await expect(page).toHaveURL(advertisementUrls.create);

    // The form is checked by the server, which refuses it: the count is unchanged.
    await ads.goto();
    expect(await ads.totalCount()).toBe(total);
  });
});

const profiles = Object.keys(advertisementAccess) as AccessProfile[];

for (const profile of profiles) {
  const allowed = advertisementAccess[profile];

  test.describe(`Advertisement permissions - ${expectedAccess[profile].label}`, () => {
    test.use({ signedInAs: profile });

    for (const [label, path] of [
      ['the advertisements list', '/backend/advertisement/advertisement/index'],
      ['an advertisement', '/backend/advertisement/advertisement/view?id=1'],
      ['the Update form', '/backend/advertisement/advertisement/update?id=1'],
      ['the Create form', '/backend/advertisement/advertisement/create'],
    ] as const) {
      test(`${allowed ? 'can' : 'cannot'} open ${label}`, async ({ page }) => {
        const response = await page.goto(path);

        expect(response?.status()).toBe(allowed ? 200 : forbiddenStatus);
      });
    }

    test(`the sidebar ${allowed ? 'links to' : 'has no link to'} Advertisement`, async ({
      page,
    }) => {
      await page.goto(backendHomePath);

      await expect(
        page.locator('.app-sidebar a[href="/backend/advertisement/advertisement/index"]'),
      ).toHaveCount(allowed ? 1 : 0);
    });

    // Sent only where it must be refused, with an advertisement ID that does not exist.
    if (!allowed) {
      test('server rejects publishing an advertisement', async ({ page, mazadDashboardPage }) => {
        await page.goto(backendHomePath);

        const status = await mazadDashboardPage.postAction(
          `${advertisementUrls.publishEndpoint}?id=0&value=1`,
        );

        expect(status, 'publish HTTP status').toBe(forbiddenStatus);
      });
    }
  });
}
