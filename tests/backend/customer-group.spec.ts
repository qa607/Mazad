import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { escapeRegExp } from '@utils/text';
import { gridSummary, listPageUrl } from '@test-data/backend-common.data';
import {
  customerGroupColumns,
  customerGroupEdgeCases,
  customerGroupLimits,
  customerGroupSearchData,
  customerGroupSortableColumns,
  customerGroupText,
  customerGroupUrls,
  editedCustomerGroup,
  newCustomerGroup,
} from '@test-data/customer-group.data';

/**
 * Mazad Backend > Users > Customer Group: list, search, paging, create, view, update and delete.
 *
 * Tests that need a group create their own "QA-AUTO CG" group through the UI, and the
 * customerGroupCleanup fixture deletes it afterwards, whether the test passed or failed. Read-only
 * tests use the groups already on staging. The file runs in order in one worker, so the tests
 * that create or delete groups never change the list while a read-only test is reading it.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);
test.describe.configure({ mode: 'default' });

const { ID: idSortKey } = customerGroupSortableColumns;

test.describe('Customer Group - list, search and paging', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, customerGroupListPage }) => {
    await customerGroupListPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(customerGroupUrls.list);
  });

  test(
    'List page shows the heading, search form and grid columns',
    { tag: ['@smoke', '@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      await expect(page).toHaveTitle(customerGroupText.listTitle);
      await expect(list.pageHeading).toHaveText(customerGroupText.listTitle);
      await expect(list.breadcrumbCurrent).toHaveText(customerGroupText.listTitle);
      await expect(list.sidebarLink).toHaveClass(/mm-active/);

      await expect(list.nameSearchInput).toBeEditable();
      await expect(list.searchButton).toBeEnabled();
      await expect(list.resetButton).toBeVisible();
      await expect(list.createButton).toBeVisible();

      await expect(list.columnHeaders).toHaveText([...customerGroupColumns]);
      await expect(list.rows.first()).toBeVisible();
      await expect(list.summary).toHaveText(/^Showing 1-\d+ of [\d,]+ items?\.$/);
    },
  );

  test(
    'Users > Customer Group in the sidebar opens the list',
    { tag: ['@functional'] },
    async ({ page, mazadDashboardPage, customerGroupListPage: list }) => {
      await mazadDashboardPage.goto();

      await mazadDashboardPage.openFromSidebar('Users', 'Customer Group');

      await expect(page).toHaveURL(customerGroupUrls.unfiltered);
      await expect(list.pageHeading).toHaveText(customerGroupText.listTitle);
    },
  );

  test(
    'Every row shows a numeric ID, a name, a member count and its row actions',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list }) => {
      const ids = await list.rowIds();
      expect(ids.length).toBeGreaterThan(0);

      for (const id of ids) {
        const row = list.row(id);
        await expect(list.nameCell(row), `group ${id} name`).not.toBeEmpty();
        await expect(list.memberCountCell(row), `group ${id} members`).toHaveText(/^\d+$/);
        await expect(list.viewLink(id)).toBeVisible();
        await expect(list.updateLink(id)).toBeVisible();
        await expect(list.deleteLink(id)).toBeVisible();
      }
      expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  test(
    'Searching by a full name shows that group',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      const id = await list.rowId(list.rows.first());
      const name = (await list.nameCell(list.row(id)).innerText()).trim();

      await list.searchByName(name);

      await expect(page).toHaveURL(customerGroupUrls.nameSearch);
      await expect(list.nameSearchInput).toHaveValue(name);
      await expect(list.row(id)).toBeVisible();
      await expect(list.rowsNamed(name)).not.toHaveCount(0);
    },
  );

  test(
    'Searching by part of a name finds matching groups, ignoring case',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list }) => {
      const id = await list.rowId(list.rows.first());
      const name = (await list.nameCell(list.row(id)).innerText()).trim();
      const partial = name.slice(0, customerGroupSearchData.partialLength);

      await list.searchByName(partial.toUpperCase());

      await expect(list.row(id)).toBeVisible();
      await expect(
        list.nameCells.filter({ hasNotText: new RegExp(escapeRegExp(partial), 'i') }),
      ).toHaveCount(0);
    },
  );

  test(
    'Searching for an unknown name shows no results',
    { tag: ['@negative'] },
    async ({ customerGroupListPage: list }) => {
      await list.searchByName(customerGroupSearchData.unknownName);

      await expect(list.emptyMessage).toHaveText(customerGroupText.noResults);
      await expect(list.rows).toHaveCount(0);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'Reset clears the search and shows every group again',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      const total = await list.totalCount();
      await list.searchByName(customerGroupSearchData.unknownName);
      await expect(list.emptyMessage).toBeVisible();

      await list.reset();

      await expect(page).toHaveURL(customerGroupUrls.unfiltered);
      await expect(list.nameSearchInput).toHaveValue('');
      await expect(list.rows.first()).toBeVisible();
      expect(await list.totalCount()).toBe(total);
    },
  );

  test(
    'ID header sorts ascending, then descending',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      await list.sortBy('ID');

      await expect(page).toHaveURL(customerGroupUrls.sortedBy(idSortKey));
      const ascending = (await list.rowIds()).map(Number);
      expect(ascending).toEqual([...ascending].sort((a, b) => a - b));

      await list.sortBy('ID');

      await expect(page).toHaveURL(customerGroupUrls.sortedBy(`-${idSortKey}`));
      const descending = (await list.rowIds()).map(Number);
      expect(descending).toEqual([...descending].sort((a, b) => b - a));
    },
  );

  test(
    'No. Of Members header sorts by member count',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      await list.sortBy('No. Of Members');

      await expect(page).toHaveURL(
        customerGroupUrls.sortedBy(customerGroupSortableColumns['No. Of Members']),
      );
      const counts = (await list.memberCountCells.allInnerTexts()).map(Number);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    },
  );

  test(
    'Only ID and No. Of Members are sortable',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list }) => {
      for (const column of customerGroupColumns) {
        const sortable = column in customerGroupSortableColumns;
        await expect(list.sortLink(column), column).toHaveCount(Number(sortable));
      }
    },
  );

  test(
    'Pager moves to the next page and marks it active',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list }) => {
      const size = customerGroupSearchData.pagerPageSize;
      await list.gotoWithPageSize(size);
      const firstPageIds = await list.rowIds();
      await expect(list.activePage).toHaveText('1');
      await expect(list.previousPage).toHaveClass(/disabled/);

      await list.goToPage(2);

      await expect(page).toHaveURL(listPageUrl(2));
      await expect(list.activePage).toHaveText('2');
      await expect(list.summary).toHaveText(gridSummary(size + 1, 2 * size));
      await expect(list.rows).toHaveCount(size);
      expect(await list.rowIds()).not.toEqual(firstPageIds);
    },
  );

  test(
    'Paging through the list shows every group exactly once',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list }) => {
      const size = customerGroupSearchData.pagerPageSize;
      const total = await list.totalCount();
      const seen: string[] = [];
      for (let pageNumber = 1; pageNumber <= Math.ceil(total / size); pageNumber++) {
        await list.gotoWithPageSize(size, pageNumber);
        seen.push(...(await list.rowIds()));
      }

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size, 'distinct groups across all pages').toBe(total);
    },
  );

  test(
    'View action opens the group details in a new tab',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list, pagesOn }) => {
      const id = await list.rowId(list.rows.first());
      const name = (await list.nameCell(list.row(id)).innerText()).trim();

      const tab = await list.openInNewTab(list.viewLink(id));

      const details = pagesOn(tab).customerGroupViewPage;
      await expect(tab).toHaveURL(customerGroupUrls.view(id));
      await expect(details.pageHeading).toHaveText(customerGroupText.viewTitle(name));
      await expect(details.nameValue).toHaveValue(name);
    },
  );

  test(
    'Update action opens the edit form with the saved name in a new tab',
    { tag: ['@functional'] },
    async ({ customerGroupListPage: list, pagesOn }) => {
      const id = await list.rowId(list.rows.first());
      const name = (await list.nameCell(list.row(id)).innerText()).trim();

      const tab = await list.openInNewTab(list.updateLink(id));

      const form = pagesOn(tab).customerGroupFormPage;
      await expect(tab).toHaveURL(customerGroupUrls.update(id));
      await expect(form.pageHeading).toHaveText(customerGroupText.updateTitle(name));
      await expect(form.nameInput).toHaveValue(name);
      await expect(form.nameInput).toBeEditable();
    },
  );

  test(
    'Member list pages have a browser title',
    { tag: ['@ui', '@known-bug'] },
    async ({ page, customerGroupListPage: list, customerGroupMembersPage: members }) => {
      test.fail(true, 'BUG: Customer Group member list pages (step 2) have an empty <title>.');
      const id = await list.rowId(list.rows.first());

      await members.gotoAdd(id);
      await expect(members.pageHeading).toHaveText(customerGroupText.membersHeading);
      await expect(page, 'step 2 after saving').toHaveTitle(/\S/);

      await members.gotoList(id);
      await expect(members.pageHeading).toHaveText(customerGroupText.membersHeading);
      await expect(page, 'step 2 from the details page').toHaveTitle(/\S/);
    },
  );
});

test.describe('Customer Group - create', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, customerGroupFormPage: form }) => {
    await form.gotoCreate();
    await expect(page).toHaveURL(customerGroupUrls.create);
  });

  test(
    'Create Customer Group opens an empty form on the first step',
    { tag: ['@functional'] },
    async ({ page, customerGroupListPage: list, customerGroupFormPage: form }) => {
      await list.goto();

      await list.createButton.click();

      await expect(page).toHaveURL(customerGroupUrls.create);
      await expect(page).toHaveTitle(customerGroupText.createTitle);
      await expect(form.pageHeading).toHaveText(customerGroupText.createTitle);
      await expect(form.nameInput).toBeEmpty();
      await expect(form.notesInput).toBeEmpty();
      await expect(form.saveButton).toBeEnabled();
      const [basicInfo, members] = customerGroupText.steps;
      await expect(form.step(basicInfo)).toHaveClass(/active/);
      await expect(form.step(members)).toHaveClass(/disabled/);
    },
  );

  test(
    'Creates a group with valid data and opens its member list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupMembersPage: members,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);

      await test.step('Fill and save the Basic Info step', async () => {
        await form.fillForm(group);
        await form.save();
      });

      await test.step('The member list (step 2) opens with a success message', async () => {
        await expect(page).toHaveURL(customerGroupUrls.anyMembers);
        await expect(members.successAlert).toContainText(customerGroupText.created);
        await expect(members.pageHeading).toHaveText(customerGroupText.membersHeading);
        const [basicInfo, customers] = customerGroupText.steps;
        await expect(members.step(basicInfo)).toHaveClass(/done/);
        await expect(members.step(customers)).toHaveClass(/active/);
      });

      await test.step('The new group is listed with no members', async () => {
        await list.goto();
        await list.searchByName(group.name);
        const row = list.rowsNamed(group.name);
        await expect(row).toHaveCount(1);
        await expect(list.memberCountCell(row)).toHaveText('0');
      });
    },
  );

  test(
    'Saving without a name shows the required message and sends nothing',
    { tag: ['@negative'] },
    async ({ page, customerGroupFormPage: form }) => {
      const submissions = form.countSubmissions();

      await form.save();

      await expect(form.nameError).toHaveText(customerGroupText.nameRequired);
      await expect(form.nameInput).toHaveClass(/is-invalid/);
      await expect(page).toHaveURL(customerGroupUrls.create);
      expect(submissions()).toBe(0);
    },
  );

  test(
    'A name of only spaces is rejected as empty',
    { tag: ['@negative'] },
    async ({ page, customerGroupFormPage: form }) => {
      const submissions = form.countSubmissions();
      await form.fillForm({ name: customerGroupEdgeCases.whitespaceName });

      await form.save();

      await expect(form.nameError).toHaveText(customerGroupText.nameRequired);
      await expect(page).toHaveURL(customerGroupUrls.create);
      expect(submissions()).toBe(0);
    },
  );

  test(
    'Name and notes stop at their maximum length',
    { tag: ['@negative'] },
    async ({ customerGroupFormPage: form }) => {
      const { tooLongName, tooLongNotes } = customerGroupEdgeCases;

      await form.fillForm({ name: tooLongName, notes: tooLongNotes });

      await expect(form.nameInput).toHaveValue(tooLongName.slice(0, customerGroupLimits.nameMax));
      await expect(form.notesInput).toHaveValue(
        tooLongNotes.slice(0, customerGroupLimits.notesMax),
      );
      await expect(form.nameError).toBeEmpty();
      await expect(form.notesError).toBeEmpty();
    },
  );

  test(
    'Accepts a name of exactly the maximum length',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupCleanup,
    }) => {
      const name = customerGroupEdgeCases.longestName();
      expect(name).toHaveLength(customerGroupLimits.nameMax);
      customerGroupCleanup.track(name);

      await form.fillForm({ name });
      await form.save();

      await expect(page).toHaveURL(customerGroupUrls.anyMembers);
      await view.goto(form.currentGroupId() ?? '');
      await expect(view.nameValue).toHaveValue(name);
    },
  );

  test(
    'Spaces around the name are trimmed when saving',
    { tag: ['@functional', '@mutates', '@known-bug'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupCleanup,
    }) => {
      test.fail(
        true,
        'BUG: leading and trailing spaces in a customer group name are saved instead of ' +
          'trimmed, although a name of only spaces is rejected as empty.',
      );
      const { name } = newCustomerGroup();
      const spaces = customerGroupEdgeCases.surroundingSpaces;
      customerGroupCleanup.track(name);

      await form.fillForm({ name: `${spaces}${name}${spaces}` });
      await form.save();

      await expect(page).toHaveURL(customerGroupUrls.anyMembers);
      await view.goto(form.currentGroupId() ?? '');
      await expect(view.nameValue).toHaveValue(name);
    },
  );

  test(
    'Special characters are saved and shown as plain text, never run as HTML',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      const name = `${newCustomerGroup().name} ${customerGroupEdgeCases.specialCharacters}`;
      const notes = customerGroupEdgeCases.scriptNotes;
      const dialogs = form.countDialogs();
      customerGroupCleanup.track(name);

      await form.fillForm({ name, notes });
      await form.save();
      await expect(page).toHaveURL(customerGroupUrls.anyMembers);
      const id = form.currentGroupId() ?? '';

      await test.step('Details page shows the exact text', async () => {
        await view.goto(id);
        await expect(view.pageHeading).toHaveText(customerGroupText.viewTitle(name));
        await expect(view.nameValue).toHaveValue(name);
        await expect(view.notesValue).toHaveValue(notes);
      });

      await test.step('The list shows the exact text', async () => {
        await list.goto();
        await list.searchByName(name);
        await expect(list.nameCell(list.row(id))).toHaveText(name);
      });

      expect(dialogs(), 'saved text must never run as script').toBe(0);
    },
  );

  test(
    'A second group with an existing name is rejected',
    { tag: ['@negative', '@mutates', '@known-bug'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      test.fail(
        true,
        'BUG: a customer group can be created with the exact name of an existing group; the ' +
          'list then shows identical, indistinguishable names.',
      );
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      await form.createGroup(group);
      await form.gotoCreate();

      await form.fillForm({ name: group.name });
      await form.save();

      // Expected: the form stays open and explains that the name is already taken
      // (checked first: the URL still matches until a save has navigated away).
      await expect(form.nameError).toHaveText(/\S/);
      await expect(page).toHaveURL(customerGroupUrls.create);
      await list.goto();
      await list.searchByName(group.name);
      await expect(list.rowsNamed(group.name), 'groups with this name').toHaveCount(1);
    },
  );
});

test.describe('Customer Group - view and update', { tag: ['@regression'] }, () => {
  test(
    'Details page shows the saved name and notes read-only',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      const id = await form.createGroup(group);

      await view.goto(id);

      await expect(page).toHaveTitle(customerGroupText.viewTitle(group.name));
      await expect(view.pageHeading).toHaveText(customerGroupText.viewTitle(group.name));
      await expect(view.breadcrumbCurrent).toHaveText(customerGroupText.viewTitle(group.name));
      await expect(view.nameValue).toHaveValue(group.name);
      await expect(view.notesValue).toHaveValue(group.notes);
      await expect(view.nameValue).not.toBeEditable();
      await expect(view.notesValue).not.toBeEditable();
      await expect(view.step(customerGroupText.steps[0])).toHaveClass(/active/);

      await view.breadcrumbList.click();

      await expect(page).toHaveURL(customerGroupUrls.list);
    },
  );

  test(
    'Updating the name and notes saves them everywhere',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupMembersPage: members,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      const edited = editedCustomerGroup(group);
      customerGroupCleanup.track(group.name);
      customerGroupCleanup.track(edited.name);
      const id = await form.createGroup(group);

      await test.step('The edit form opens with the saved values', async () => {
        await form.gotoUpdate(id);
        await expect(form.pageHeading).toHaveText(customerGroupText.updateTitle(group.name));
        await expect(form.nameInput).toHaveValue(group.name);
        await expect(form.notesInput).toHaveValue(group.notes);
      });

      await test.step('Save new values', async () => {
        await form.fillForm(edited);
        await form.save();
        await expect(page).toHaveURL(customerGroupUrls.members(id));
        await expect(members.successAlert).toContainText(customerGroupText.updated);
      });

      await test.step('The details page shows the new values', async () => {
        await view.goto(id);
        await expect(view.pageHeading).toHaveText(customerGroupText.viewTitle(edited.name));
        await expect(view.nameValue).toHaveValue(edited.name);
        await expect(view.notesValue).toHaveValue(edited.notes);
      });

      await test.step('The edit form keeps the new values after a reload', async () => {
        await form.gotoUpdate(id);
        await page.reload();
        await expect(form.nameInput).toHaveValue(edited.name);
        await expect(form.notesInput).toHaveValue(edited.notes);
      });

      await test.step('The list finds the group by its new name only', async () => {
        await list.goto();
        await list.searchByName(edited.name);
        await expect(list.nameCell(list.row(id))).toHaveText(edited.name);
        await list.searchByName(group.name);
        await expect(list.rowsNamed(group.name)).toHaveCount(0);
      });
    },
  );

  test(
    'Clearing the name on update is rejected and nothing is saved',
    { tag: ['@negative', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupViewPage: view,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      const id = await form.createGroup(group);
      await form.gotoUpdate(id);
      const submissions = form.countSubmissions();

      await form.fillForm({ name: '' });
      await form.save();

      await expect(form.nameError).toHaveText(customerGroupText.nameRequired);
      await expect(page).toHaveURL(customerGroupUrls.update(id));
      expect(submissions()).toBe(0);
      await view.goto(id);
      await expect(view.nameValue).toHaveValue(group.name);
    },
  );
});

test.describe('Customer Group - delete', { tag: ['@regression'] }, () => {
  test(
    'Cancelling the delete confirmation keeps the group',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      const id = await form.createGroup(group);
      await list.goto();
      await list.searchByName(group.name);

      await list.openDeleteConfirmation(id);

      await expect(list.deleteDialog.dialog).toBeVisible();
      await expect(list.deleteDialog.message).toHaveText(customerGroupText.deleteConfirmMessage);

      await list.deleteDialog.cancel();

      await expect(list.deleteDialog.dialog).toBeHidden();
      await page.reload();
      await expect(list.row(id)).toBeVisible();
    },
  );

  test(
    'Deleting a group after confirming removes it from the list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      customerGroupFormPage: form,
      customerGroupListPage: list,
      customerGroupCleanup,
    }) => {
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      const id = await form.createGroup(group);
      await list.goto();
      await list.searchByName(group.name);
      await expect(list.row(id)).toBeVisible();

      await list.deleteGroup(id);

      await expect(page).toHaveURL(customerGroupUrls.list);
      await expect(list.successAlert).toContainText(customerGroupText.deleted);
      await list.searchByName(group.name);
      await expect(list.emptyMessage).toHaveText(customerGroupText.noResults);
    },
  );

  test(
    'A deleted group can no longer be opened',
    { tag: ['@negative', '@mutates', '@known-bug'] },
    async ({
      customerGroupFormPage: form,
      customerGroupListPage: list,
      customerGroupViewPage: view,
      customerGroupCleanup,
    }) => {
      test.fail(
        true,
        'BUG: a deleted customer group still opens on its View and Update pages (HTTP 200, ' +
          'editable), while an unknown id correctly shows "Not Found (#404)".',
      );
      const group = newCustomerGroup();
      customerGroupCleanup.track(group.name);
      const id = await form.createGroup(group);
      await list.goto();
      await list.searchByName(group.name);
      await list.deleteGroup(id);

      await view.goto(id);
      await expect(view.pageHeading, 'details page').toHaveText(customerGroupText.notFound);

      await form.gotoUpdate(id);
      await expect(form.pageHeading, 'edit form').toHaveText(customerGroupText.notFound);
    },
  );
});
