import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  editedTrafficOffice,
  newTrafficOffice,
  trafficOfficeColumns,
  trafficOfficeExportFormats,
  trafficOfficeFilters,
  trafficOfficeRowActions,
  trafficOfficeSearchData,
  trafficOfficeStatuses,
  trafficOfficeText,
  trafficOfficeUrls,
  trafficOfficeViewLabels,
} from '@test-data/traffic-office.data';

/**
 * Mazad Backend > Global Settings > Traffic Office: the list (search, status filter, export)
 * and the create, view, update and delete flows.
 *
 * Read-only tests use the existing offices. Tests that change data create their own
 * "QA-AUTO TO" offices through the UI; the trafficOfficeCleanup fixture deletes them afterwards,
 * whether the test passed or failed. The file runs in order in one worker, so tests that create
 * or delete offices never change the list while a read-only test is reading it.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);
test.describe.configure({ mode: 'default' });

test.describe('Traffic Office - list', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, trafficOfficeListPage: list }) => {
    await list.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(trafficOfficeUrls.list);
  });

  test(
    'Opens from Global Settings > Traffic Office in the sidebar',
    { tag: '@functional' },
    async ({ page, mazadDashboardPage, trafficOfficeListPage: list }) => {
      await mazadDashboardPage.goto();

      await list.openFromSidebar(trafficOfficeText.sidebarParent, trafficOfficeText.sidebarLabel);

      await expect(page).toHaveURL(trafficOfficeUrls.list);
      await expect(list.pageHeading).toHaveText(trafficOfficeText.listTitle);
      await expect(list.sidebarLink).toHaveClass(/mm-active/);
    },
  );

  test(
    'Shows the search form, the grid columns and Create Traffic Office',
    { tag: ['@smoke', '@functional'] },
    async ({ page, trafficOfficeListPage: list }) => {
      await expect(page).toHaveTitle(trafficOfficeText.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(trafficOfficeText.listTitle);
      await expect(list.createButton).toHaveText(trafficOfficeText.createButton);
      await expect(list.filterLabels).toHaveText([...trafficOfficeFilters]);
      await expect(list.officeNameSearchInput).toBeEmpty();
      await expect(list.officeNameEnSearchInput).toBeEmpty();
      await expect(list.statusFilterValue).toHaveText(trafficOfficeText.statusPlaceholder);
      await expect(list.columnHeaders).toHaveText([...trafficOfficeColumns]);

      await expect(list.rows.first()).toBeVisible();
      expect(await list.totalCount()).toBe(await list.rows.count());
    },
  );

  test(
    'Every office has a status and View and Update actions',
    { tag: '@functional' },
    async ({ trafficOfficeListPage: list }) => {
      const count = await list.rows.count();
      await expect(list.statusSelects).toHaveCount(count);
      for (const row of await list.rows.all()) {
        const id = await list.rowId(row);
        const actions = list.actionLinks(row);
        await expect(actions, `office ${id}`).toHaveCount(trafficOfficeRowActions.length);
        for (const [index, name] of trafficOfficeRowActions.entries()) {
          await expect(actions.nth(index)).toHaveAccessibleName(name);
        }
        await expect(list.viewLink(id)).toHaveAttribute('target', '_blank');
        await expect(list.updateLink(id)).toHaveAttribute('target', '_blank');
      }
    },
  );

  test(
    'Export All offers CSV and Excel',
    { tag: '@functional' },
    async ({ trafficOfficeListPage: list }) => {
      await list.openExportMenu();

      await expect(list.exportFormats).toHaveText([...trafficOfficeExportFormats]);
    },
  );

  test(
    'Office Name En finds offices by part of the name, ignoring case',
    { tag: '@functional' },
    async ({ trafficOfficeListPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const nameEn = (await list.officeNameEnCell(row).innerText()).trim();
      const part = nameEn.slice(1, -1).toLowerCase();

      await list.searchByOfficeNameEn(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.officeNameEnCells.all()) {
        expect((await cell.innerText()).toLowerCase()).toContain(part);
      }
    },
  );

  test(
    'Office Name finds offices by part of the Arabic name',
    { tag: '@functional' },
    async ({ trafficOfficeListPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const name = (await list.officeNameCell(row).innerText()).trim();
      const part = name.slice(name.indexOf(' ') + 1);

      await list.searchByOfficeName(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.officeNameCells.all()) {
        expect(await cell.innerText()).toContain(part);
      }
    },
  );

  for (const status of trafficOfficeStatuses) {
    test(
      `Status ${status.label} lists only ${status.label.toLowerCase()}ed offices`,
      { tag: '@functional' },
      async ({ trafficOfficeListPage: list }) => {
        await list.filterByStatus(status.label);

        await expect(list.statusFilterValue).toHaveAttribute('title', status.label);
        const statuses = await list.statusValues();
        expect(statuses.filter((value) => value !== status.value)).toEqual([]);
      },
    );
  }

  test(
    'An unknown name finds nothing',
    { tag: '@negative' },
    async ({ trafficOfficeListPage: list }) => {
      await list.searchByOfficeNameEn(trafficOfficeSearchData.unknownName);

      await expect(list.rows).toHaveCount(0);
      await expect(list.emptyMessage).toHaveText(trafficOfficeText.noResults);
    },
  );

  test(
    'Reset clears the search',
    { tag: '@functional' },
    async ({ page, trafficOfficeListPage: list }) => {
      const total = await list.totalCount();
      await list.searchByOfficeNameEn(trafficOfficeSearchData.unknownName);
      await expect(list.emptyMessage).toBeVisible();

      await list.reset();

      await expect(page).toHaveURL(trafficOfficeUrls.list);
      await expect(list.officeNameEnSearchInput).toBeEmpty();
      expect(await list.totalCount()).toBe(total);
    },
  );
});

test.describe('Traffic Office - create', { tag: '@regression' }, () => {
  test(
    'Create Traffic Office opens an empty form, and Cancel returns to the list',
    { tag: '@functional' },
    async ({ page, trafficOfficeListPage: list, trafficOfficeFormPage: form }) => {
      await list.goto();
      await list.openCreateForm();

      await expect(page).toHaveURL(trafficOfficeUrls.create);
      await expect(form.pageHeading).toHaveText(trafficOfficeText.createTitle);
      await expect(form.officeNameInput).toBeEmpty();
      await expect(form.officeNameEnInput).toBeEmpty();

      await form.cancel();

      await expect(page).toHaveURL(trafficOfficeUrls.list);
    },
  );

  test(
    'An empty form is rejected with a message under each field',
    { tag: '@negative' },
    async ({ page, trafficOfficeFormPage: form }) => {
      await form.gotoCreate();
      const submissions = form.countSubmissions();

      await form.save();

      await expect(form.officeNameError).toHaveText(trafficOfficeText.officeNameRequired);
      await expect(form.officeNameEnError).toHaveText(trafficOfficeText.officeNameEnRequired);
      await expect(page).toHaveURL(trafficOfficeUrls.create);
      expect(submissions()).toBe(0);
    },
  );

  test(
    'Creates a traffic office, shown on its View page and first in the list',
    { tag: ['@smoke', '@crud', '@mutates'] },
    async ({
      page,
      trafficOfficeFormPage: form,
      trafficOfficeViewPage: view,
      trafficOfficeListPage: list,
      trafficOfficeCleanup,
    }) => {
      const office = newTrafficOffice();
      trafficOfficeCleanup.track(office.officeNameEn);

      await test.step('save the form', async () => {
        await form.gotoCreate();
        await form.fillForm(office);
        await form.saveAndWaitForPageLoad();
      });

      const id = await test.step('its View page opens with the saved names', async () => {
        await expect(page).toHaveURL(trafficOfficeUrls.anyView);
        await expect(view.pageHeading).toHaveText(office.officeNameEn);
        await expect(view.value('Office Name')).toHaveText(office.officeName);
        await expect(view.value('Office Name En')).toHaveText(office.officeNameEn);
        return trafficOfficeUrls.anyView.exec(page.url())![1];
      });

      await test.step('it is listed first, published', async () => {
        await list.goto();
        const first = list.rows.first();
        expect(await list.rowId(first)).toBe(id);
        await expect(list.officeNameCell(first)).toHaveText(office.officeName);
        await expect(list.officeNameEnCell(first)).toHaveText(office.officeNameEn);
        await expect(list.statusSelect(first)).toHaveValue(trafficOfficeStatuses[0].value);
      });
    },
  );

  test(
    'Confirms a new office with a success message',
    {
      tag: ['@functional', '@mutates', '@known-bug'],
      annotation: { type: 'issue', description: 'No ticket yet (found 2026-11-11 on stg-154).' },
    },
    async ({ trafficOfficeFormPage: form, trafficOfficeCleanup }) => {
      test.fail(
        true,
        'BUG: Saving a traffic office (create, update) or deleting one shows no success message, unlike other Backend modules.',
      );
      const office = newTrafficOffice();
      trafficOfficeCleanup.track(office.officeNameEn);
      await form.gotoCreate();
      await form.fillForm(office);

      await form.saveAndWaitForPageLoad();

      await expect(form.successAlert).toBeVisible({ timeout: 3_000 });
    },
  );
});

test.describe('Traffic Office - view, update and delete', { tag: '@regression' }, () => {
  test(
    'The View page shows the office details with Back, Update and Delete',
    { tag: ['@functional', '@mutates'] },
    async ({ page, createTrafficOffice, trafficOfficeViewPage: view }) => {
      const office = newTrafficOffice();
      const id = await createTrafficOffice(office);

      await view.goto(id);

      await expect(page).toHaveURL(trafficOfficeUrls.view(id));
      await expect(view.pageHeading).toHaveText(office.officeNameEn);
      await expect(view.breadcrumbCurrent).toHaveText(office.officeNameEn);
      await expect(view.detailLabels).toHaveText([...trafficOfficeViewLabels]);
      await expect(view.value('ID')).toHaveText(id);
      await expect(view.value('Office Name')).toHaveText(office.officeName);
      await expect(view.value('Office Name En')).toHaveText(office.officeNameEn);
      await expect(view.backLink).toBeVisible();
      await expect(view.updateLink).toHaveAttribute('href', new RegExp(`update\\?id=${id}$`));
      await expect(view.deleteButton).toBeVisible();
    },
  );

  test(
    'Updates the names from the grid, kept after a reload and shown in the list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ createTrafficOffice, trafficOfficeCleanup, trafficOfficeListPage: list, pagesOn }) => {
      const office = newTrafficOffice();
      const edited = editedTrafficOffice(office);
      trafficOfficeCleanup.track(edited.officeNameEn);
      const id = await createTrafficOffice(office);

      const tab = await test.step('open Update from the grid (new tab)', async () => {
        await list.gotoSearch({ office_name_en: office.officeNameEn });
        return list.openInNewTab(list.updateLink(id));
      });

      const { trafficOfficeFormPage: form, trafficOfficeViewPage: view } = pagesOn(tab);

      await test.step('the form holds the saved values', async () => {
        await expect(tab).toHaveURL(trafficOfficeUrls.update(id));
        await expect(form.pageHeading).toHaveText(
          trafficOfficeText.updateTitle(office.officeNameEn),
        );
        await expect(form.officeNameInput).toHaveValue(office.officeName);
        await expect(form.officeNameEnInput).toHaveValue(office.officeNameEn);
        await expect(form.statusValue).toHaveAttribute('title', trafficOfficeStatuses[0].label);
      });

      await test.step('save new names', async () => {
        await form.fillForm(edited);
        await form.saveAndWaitForPageLoad();
        await expect(tab).toHaveURL(trafficOfficeUrls.view(id));
      });

      await test.step('the View page keeps them after a reload', async () => {
        await tab.reload();
        await expect(view.pageHeading).toHaveText(edited.officeNameEn);
        await expect(view.value('Office Name')).toHaveText(edited.officeName);
        await expect(view.value('Office Name En')).toHaveText(edited.officeNameEn);
      });

      await test.step('the list shows them', async () => {
        await list.gotoSearch({ office_name_en: edited.officeNameEn });
        await expect(list.officeNameCell(list.row(id))).toHaveText(edited.officeName);
        await expect(list.officeNameEnCell(list.row(id))).toHaveText(edited.officeNameEn);
      });

      await tab.close();
    },
  );

  test(
    'Clearing Office Name En on update is rejected and keeps the saved name',
    { tag: ['@negative', '@mutates'] },
    async ({
      page,
      createTrafficOffice,
      trafficOfficeFormPage: form,
      trafficOfficeViewPage: view,
    }) => {
      const office = newTrafficOffice();
      const id = await createTrafficOffice(office);
      await form.gotoUpdate(id);
      const submissions = form.countSubmissions();

      await form.fillForm({ officeNameEn: '' });
      await form.save();

      await expect(form.officeNameEnError).toHaveText(trafficOfficeText.officeNameEnRequired);
      await expect(page).toHaveURL(trafficOfficeUrls.update(id));
      expect(submissions()).toBe(0);

      await view.goto(id);
      await expect(view.value('Office Name En')).toHaveText(office.officeNameEn);
    },
  );

  test(
    'Deletes an office from its View page after confirmation',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      createTrafficOffice,
      trafficOfficeViewPage: view,
      trafficOfficeListPage: list,
    }) => {
      const office = newTrafficOffice();
      const id = await createTrafficOffice(office);
      await view.goto(id);

      const message = await view.delete();

      expect(message).toBe(trafficOfficeText.deleteConfirm);
      await expect(page).toHaveURL(trafficOfficeUrls.list);
      await expect(list.row(id)).toHaveCount(0);
      await list.gotoSearch({ office_name_en: office.officeNameEn });
      await expect(list.rows).toHaveCount(0);
      await expect(list.emptyMessage).toHaveText(trafficOfficeText.noResults);
    },
  );
});
