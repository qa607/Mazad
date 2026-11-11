import { devRootSession, expect, test } from '@fixtures/test.fixture';
import { gridSummary, listPageUrl } from '@test-data/backend-common.data';
import {
  crudTaxonomyType,
  editedTaxonomyTerm,
  newTaxonomyTerm,
  pagedTaxonomyType,
  taxonomyColumns,
  taxonomyEdgeCases,
  taxonomyLimits,
  taxonomySearchData,
  taxonomySortableColumns,
  taxonomyStatusFilters,
  taxonomyText,
  taxonomyTypeNames,
  taxonomyUrls,
} from '@test-data/taxonomy.data';

/**
 * Mazad Backend > Global Settings > Taxonomy: the types page, then one type's term list (search,
 * filter, sort, paging) and the term create, view, update and delete flows.
 *
 * CRUD tests work in "Failed Auctions Reasons" (a short type with only Title and Title En) and
 * create their own "QA-AUTO TX" terms through the UI; the taxonomyCleanup fixture deletes them
 * afterwards, whether the test passed or failed. Sorting and paging are read-only checks on
 * "Makes", the longest type. The file runs in order in one worker, so the tests that create or
 * delete terms never change a list while a read-only test is reading it.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);
test.describe.configure({ mode: 'default' });

const crud = crudTaxonomyType;
const paged = pagedTaxonomyType;

test.describe('Taxonomy - types page', { tag: ['@regression'] }, () => {
  test.beforeEach(async ({ page, taxonomyTypesPage }) => {
    await taxonomyTypesPage.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(taxonomyUrls.types);
  });

  test(
    'Types page lists every taxonomy type with its manage and order links',
    { tag: ['@smoke', '@functional'] },
    async ({ page, taxonomyTypesPage: types }) => {
      await expect(page).toHaveTitle(taxonomyText.typesTitle);
      await expect(types.pageHeading).toHaveText(taxonomyText.typesTitle);
      await expect(types.breadcrumbCurrent).toHaveText(taxonomyText.typesTitle);
      await expect(types.sidebarLink).toHaveClass(/mm-active/);

      await expect(types.typeRows).toHaveCount(taxonomyTypeNames.length);
      expect(await types.typeNames()).toEqual([...taxonomyTypeNames]);
      for (const name of taxonomyTypeNames) {
        await expect(types.manageLink(name), `${name} manage link`).toBeVisible();
        await expect(types.orderLink(name), `${name} order link`).toBeVisible();
      }
    },
  );

  test(
    'Global Settings > Taxonomy in the sidebar opens the types page',
    { tag: ['@functional'] },
    async ({ page, mazadDashboardPage, taxonomyTypesPage: types }) => {
      await mazadDashboardPage.goto();

      await mazadDashboardPage.openFromSidebar('Global Settings', 'Taxonomy');

      await expect(page).toHaveURL(taxonomyUrls.types);
      await expect(types.pageHeading).toHaveText(taxonomyText.typesTitle);
    },
  );

  test(
    'Manage / View List opens the term list of that type',
    { tag: ['@functional'] },
    async ({ page, taxonomyTypesPage: types, taxonomyListPage: list }) => {
      await types.openTypeList(crud.label);

      await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
      await expect(page).toHaveTitle(crud.label);
      await expect(list.pageHeading).toHaveText(crud.label);
      await expect(list.breadcrumbCurrent).toHaveText(crud.label);
      await expect(list.rows.first()).toBeVisible();
    },
  );
});

test.describe('Taxonomy - term list, search and paging', { tag: ['@regression'] }, () => {
  test(
    'Term list shows the search form, the grid columns and every row action',
    { tag: ['@smoke', '@functional'] },
    async ({ page, taxonomyListPage: list }) => {
      await list.gotoType(crud.key);

      await expect(page).toHaveTitle(crud.label);
      await expect(list.titleSearchInput).toBeEditable();
      await expect(list.titleEnSearchInput).toBeEditable();
      await expect(list.statusFilterValue).toBeVisible();
      await expect(list.searchButton).toBeEnabled();
      await expect(list.resetButton).toBeVisible();
      await expect(list.createButton).toBeVisible();

      await expect(list.columnHeaders).toHaveText([...taxonomyColumns]);
      await expect(list.summary).toHaveText(/^Showing 1-\d+ of \d+ items?\.$/);
      const ids = await list.rowIds();
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        await expect(list.titleEnCell(list.row(id)), `term ${id} Title En`).not.toBeEmpty();
        await expect(list.viewLink(id), `term ${id} View`).toBeVisible();
        await expect(list.updateLink(id), `term ${id} Update`).toBeVisible();
        await expect(list.deleteLink(id), `term ${id} Delete`).toBeVisible();
      }
    },
  );

  test(
    'Only ID, Active, Created At and Updated At can be sorted',
    { tag: ['@functional'] },
    async ({ taxonomyListPage: list }) => {
      await list.gotoType(crud.key);

      for (const column of taxonomyColumns) {
        const sortable = column in taxonomySortableColumns;
        await expect(list.sortLink(column), `${column} sort link`).toHaveCount(sortable ? 1 : 0);
      }
    },
  );

  test(
    'Sorting by ID orders the terms ascending, then descending',
    { tag: ['@functional'] },
    async ({ page, taxonomyListPage: list }) => {
      await list.gotoType(paged.key);
      const idKey = taxonomySortableColumns.ID;
      const numeric = (ids: string[]) => ids.map(Number);

      await test.step('Ascending', async () => {
        await list.sortBy('ID');
        await expect(page).toHaveURL(taxonomyUrls.sortedBy(idKey));
        const ids = numeric(await list.rowIds());
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
      });

      await test.step('Descending', async () => {
        await list.sortBy('ID');
        await expect(page).toHaveURL(taxonomyUrls.sortedBy(`-${idKey}`));
        const ids = numeric(await list.rowIds());
        expect(ids).toEqual([...ids].sort((a, b) => b - a));
      });
    },
  );

  test(
    'Pager moves between pages and stops at the last one',
    { tag: ['@functional'] },
    async ({ page, taxonomyListPage: list }) => {
      const { pageSize } = taxonomyLimits;
      await list.gotoType(paged.key);
      const { total } = await list.summaryCounts();
      const lastPage = Math.ceil(total / pageSize);
      expect(lastPage, 'Makes spans several pages').toBeGreaterThan(2);

      await test.step('First page', async () => {
        await expect(list.summary).toHaveText(gridSummary(1, pageSize));
        await expect(list.activePage).toHaveText('1');
        await expect(list.previousPage).toHaveClass(/disabled/);
      });

      await test.step('Page 2 from its link', async () => {
        await list.goToPage(2);
        await expect(page).toHaveURL(listPageUrl(2));
        await expect(page).toHaveURL(taxonomyUrls.anyList(paged.key));
        await expect(list.summary).toHaveText(gridSummary(pageSize + 1, 2 * pageSize));
        await expect(list.activePage).toHaveText('2');
        await expect(list.previousPage).not.toHaveClass(/disabled/);
      });

      await test.step('Last page', async () => {
        await list.gotoType(paged.key, { page: String(lastPage) });
        await expect(list.summary).toHaveText(gridSummary((lastPage - 1) * pageSize + 1, total));
        await expect(list.activePage).toHaveText(String(lastPage));
        await expect(list.nextPage).toHaveClass(/disabled/);
      });
    },
  );

  test(
    'Every term appears on exactly one page',
    { tag: ['@functional'] },
    async ({ taxonomyListPage: list }) => {
      await list.gotoType(paged.key);
      const { total } = await list.summaryCounts();
      const pages = Math.ceil(total / taxonomyLimits.pageSize);

      const seen: string[] = [];
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        await list.gotoType(paged.key, { page: String(pageNumber) });
        seen.push(...(await list.rowIds()));
      }

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size, 'no term on two pages').toBe(total);
    },
  );

  for (const { label, value, active } of taxonomyStatusFilters) {
    test(
      `Status filter "${label}" shows only ${label.toLowerCase()} terms`,
      { tag: ['@functional'] },
      async ({ page, taxonomyListPage: list }) => {
        await list.gotoType(paged.key);

        await list.filterByStatus(label);

        await expect(page).toHaveURL(taxonomyUrls.statusFilter(value));
        await expect(list.statusFilterValue).toHaveAttribute('title', label);
        const toggles = await list.activeToggles.all();
        for (const [index, toggle] of toggles.entries()) {
          await expect(toggle, `row ${index + 1} Active`).toBeChecked({ checked: active });
        }
      },
    );
  }

  test(
    'Searching for an unknown title shows no results',
    { tag: ['@negative'] },
    async ({ taxonomyListPage: list }) => {
      await list.gotoType(crud.key);

      await list.searchByTitleEn(taxonomySearchData.unknownTitle);

      await expect(list.emptyMessage).toHaveText(taxonomyText.noResults);
      await expect(list.rows).toHaveCount(0);
      await expect(list.summary).toHaveCount(0);
    },
  );

  test(
    'Reset clears the search and shows the whole type again',
    { tag: ['@functional'] },
    async ({ page, taxonomyListPage: list }) => {
      await list.gotoType(crud.key);
      const total = await list.totalCount();
      await list.searchByTitleEn(taxonomySearchData.unknownTitle);
      await expect(list.rows).toHaveCount(0);

      await list.reset();

      await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
      await expect(list.titleEnSearchInput).toHaveValue('');
      expect(await list.totalCount()).toBe(total);
    },
  );

  test(
    'Title En search matches part of the title, ignoring case',
    { tag: ['@functional', '@mutates'] },
    async ({ page, taxonomyListPage: list, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);
      const partial = taxonomySearchData.partialTitleEn(term.titleEn);

      await list.gotoType(crud.key);
      await list.searchByTitleEn(partial);

      await expect(page).toHaveURL(taxonomyUrls.titleEnSearch);
      await expect(list.titleEnSearchInput).toHaveValue(partial);
      await expect(list.row(id)).toBeVisible();
      for (const title of await list.titleEnCells.allInnerTexts()) {
        expect(title.toLowerCase()).toContain(partial);
      }
    },
  );

  test(
    'Title search finds a term by its Arabic title',
    { tag: ['@functional', '@mutates'] },
    async ({ taxonomyListPage: list, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);

      await list.gotoType(crud.key);
      await list.searchByTitle(term.title);

      await expect(list.rows).toHaveCount(1);
      await expect(list.titleCell(list.row(id))).toHaveText(term.title);
    },
  );

  test(
    'View and Update row actions open in a new tab',
    { tag: ['@functional'] },
    async ({ taxonomyListPage: list, pagesOn }) => {
      await list.gotoType(crud.key);
      const [id] = await list.rowIds();

      await test.step('View', async () => {
        const tab = await list.openInNewTab(list.viewLink(id));
        await expect(tab).toHaveURL(taxonomyUrls.view(id));
        await expect(pagesOn(tab).taxonomyViewPage.idValue).toHaveText(id);
        await tab.close();
      });

      await test.step('Update', async () => {
        const tab = await list.openInNewTab(list.updateLink(id));
        await expect(tab).toHaveURL(taxonomyUrls.update(id));
        await expect(pagesOn(tab).taxonomyFormPage.titleEnInput).not.toHaveValue('');
        await tab.close();
      });
    },
  );
});

test.describe('Taxonomy - create', { tag: ['@regression'] }, () => {
  test(
    'Create form opens empty for the chosen type and Cancel returns to its list',
    { tag: ['@functional'] },
    async ({ page, taxonomyListPage: list, taxonomyFormPage: form }) => {
      await list.gotoType(crud.key);
      await list.createButton.click();

      await expect(page).toHaveURL(taxonomyUrls.create(crud.key));
      await expect(page).toHaveTitle(taxonomyText.createTitle(crud.label));
      await expect(form.pageHeading).toHaveText(taxonomyText.createTitle(crud.label));
      await expect(form.titleInput).toHaveValue('');
      await expect(form.titleEnInput).toHaveValue('');
      await expect(form.saveButton).toBeEnabled();

      await form.cancel();
      await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
    },
  );

  test(
    'A valid term is created active and listed under its type',
    { tag: ['@smoke', '@functional', '@crud', '@mutates'] },
    async ({ page, taxonomyFormPage: form, taxonomyListPage: list, taxonomyCleanup }) => {
      const term = newTaxonomyTerm();
      taxonomyCleanup.track(crud.key, term.titleEn);

      await test.step('Fill and save the form', async () => {
        await form.gotoCreate(crud.key);
        await form.fillForm(term);
        await form.saveAndWaitForPageLoad();
      });

      await test.step('The list shows the new term with a success message', async () => {
        await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
        await expect(list.successAlert).toContainText(taxonomyText.created);
        const row = list.rowsTitledEn(term.titleEn);
        await expect(row).toHaveCount(1);
        await expect(list.titleCell(row)).toHaveText(term.title);
        await expect(list.activeToggle(row)).toBeChecked();
      });
    },
  );

  test(
    'Saving an empty form shows both required messages and sends nothing',
    { tag: ['@negative'] },
    async ({ page, taxonomyFormPage: form }) => {
      await form.gotoCreate(crud.key);
      const submissions = form.countSubmissions();

      await form.save();

      await expect(form.titleError).toHaveText(taxonomyText.titleRequired);
      await expect(form.titleEnError).toHaveText(taxonomyText.titleEnRequired);
      await expect(page).toHaveURL(taxonomyUrls.create(crud.key));
      expect(submissions()).toBe(0);
    },
  );

  test(
    'Titles of only spaces count as empty',
    { tag: ['@negative'] },
    async ({ page, taxonomyFormPage: form }) => {
      await form.gotoCreate(crud.key);
      const submissions = form.countSubmissions();

      await form.fillForm({
        title: taxonomyEdgeCases.whitespace,
        titleEn: taxonomyEdgeCases.whitespace,
      });
      await form.save();

      await expect(form.titleError).toHaveText(taxonomyText.titleRequired);
      await expect(form.titleEnError).toHaveText(taxonomyText.titleEnRequired);
      await expect(page).toHaveURL(taxonomyUrls.create(crud.key));
      expect(submissions()).toBe(0);
    },
  );

  test(
    `Title inputs stop at ${taxonomyLimits.titleMax} characters`,
    { tag: ['@negative'] },
    async ({ taxonomyFormPage: form }) => {
      const limited = taxonomyEdgeCases.tooLongTitle.slice(0, taxonomyLimits.titleMax);
      await form.gotoCreate(crud.key);

      await form.fillForm({
        title: taxonomyEdgeCases.tooLongTitle,
        titleEn: taxonomyEdgeCases.tooLongTitle,
      });

      await expect(form.titleInput).toHaveValue(limited);
      await expect(form.titleEnInput).toHaveValue(limited);
    },
  );

  test(
    `Titles of exactly ${taxonomyLimits.titleMax} characters are saved in full`,
    { tag: ['@functional', '@mutates'] },
    async ({ taxonomyFormPage: form, createTaxonomyTerm }) => {
      const term = taxonomyEdgeCases.longestTerm();
      expect(term.titleEn).toHaveLength(taxonomyLimits.titleMax);

      const id = await createTaxonomyTerm(crud.key, term);

      await form.gotoUpdate(id);
      await expect(form.titleInput).toHaveValue(term.title);
      await expect(form.titleEnInput).toHaveValue(term.titleEn);
    },
  );

  test(
    'HTML and script in the titles are saved and shown as plain text',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      taxonomyListPage: list,
      taxonomyViewPage: view,
      taxonomyFormPage: form,
      createTaxonomyTerm,
    }) => {
      const base = newTaxonomyTerm();
      const term = {
        title: `${base.title} ${taxonomyEdgeCases.script}`,
        titleEn: `${base.titleEn} ${taxonomyEdgeCases.specialCharacters}`,
      };
      const dialogs = list.countDialogs();

      const id = await createTaxonomyTerm(crud.key, term);

      await test.step('List', async () => {
        await expect(list.titleCell(list.row(id))).toHaveText(term.title);
        await expect(list.titleEnCell(list.row(id))).toHaveText(term.titleEn);
      });

      await test.step('Details page', async () => {
        await view.goto(id);
        await expect(page).toHaveTitle(term.titleEn);
        await expect(view.pageHeading).toHaveText(term.titleEn);
        await expect(view.titleValue).toHaveText(term.title);
        await expect(view.titleEnValue).toHaveText(term.titleEn);
      });

      await test.step('Update form', async () => {
        await form.gotoUpdate(id);
        await expect(form.pageHeading).toHaveText(taxonomyText.updateTitle(term.titleEn));
        await expect(form.titleInput).toHaveValue(term.title);
      });

      expect(dialogs(), 'no script ran').toBe(0);
    },
  );
});

test.describe('Taxonomy - view and update', { tag: ['@regression'] }, () => {
  test(
    'Details page shows the term read-only with Back, Update and Delete',
    { tag: ['@functional', '@mutates'] },
    async ({ page, taxonomyViewPage: view, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);

      await view.goto(id);

      await expect(page).toHaveTitle(term.titleEn);
      await expect(view.pageHeading).toHaveText(term.titleEn);
      await expect(view.breadcrumbCurrent).toHaveText(term.titleEn);
      await expect(view.breadcrumbRoot).toBeVisible();
      await expect(view.idValue).toHaveText(id);
      await expect(view.titleValue).toHaveText(term.title);
      await expect(view.titleEnValue).toHaveText(term.titleEn);
      await expect(view.activeValue).toHaveText(taxonomyText.activeYes);
      await expect(view.editableFields).toHaveCount(0);
      await expect(view.updateLink).toBeVisible();
      await expect(view.deleteButton).toBeVisible();

      await view.goBack();
      await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
    },
  );

  test(
    'An update is saved and still shown after a reload',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({
      page,
      taxonomyFormPage: form,
      taxonomyListPage: list,
      taxonomyViewPage: view,
      taxonomyCleanup,
      createTaxonomyTerm,
    }) => {
      const term = newTaxonomyTerm();
      const edited = editedTaxonomyTerm(term);
      taxonomyCleanup.track(crud.key, edited.titleEn);
      const id = await createTaxonomyTerm(crud.key, term);

      await test.step('The update form shows the saved values', async () => {
        await form.gotoUpdate(id);
        await expect(page).toHaveTitle(taxonomyText.updateTitle(term.titleEn));
        await expect(form.pageHeading).toHaveText(taxonomyText.updateTitle(term.titleEn));
        await expect(form.titleInput).toHaveValue(term.title);
        await expect(form.titleEnInput).toHaveValue(term.titleEn);
      });

      await test.step('Save the changes', async () => {
        await form.fillForm(edited);
        await form.saveAndWaitForPageLoad();
        await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
        await expect(list.successAlert).toContainText(taxonomyText.updated);
      });

      await test.step('The changes are kept after a reload', async () => {
        await form.gotoUpdate(id);
        await page.reload();
        await expect(form.titleInput).toHaveValue(edited.title);
        await expect(form.titleEnInput).toHaveValue(edited.titleEn);
      });

      await test.step('The details page and the list show the changes', async () => {
        await view.goto(id);
        await expect(view.titleValue).toHaveText(edited.title);
        await expect(view.titleEnValue).toHaveText(edited.titleEn);
        expect(await list.idsOfTermsTitledEn(crud.key, edited.titleEn)).toEqual([id]);
      });
    },
  );

  test(
    'Clearing Title En on update is rejected and keeps the saved value',
    { tag: ['@negative', '@mutates'] },
    async ({ page, taxonomyFormPage: form, taxonomyViewPage: view, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);
      await form.gotoUpdate(id);
      const submissions = form.countSubmissions();

      await form.fillForm({ titleEn: '' });
      await form.save();

      await expect(form.titleEnError).toHaveText(taxonomyText.titleEnRequired);
      await expect(page).toHaveURL(taxonomyUrls.update(id));
      expect(submissions()).toBe(0);
      await view.goto(id);
      await expect(view.titleEnValue).toHaveText(term.titleEn);
    },
  );
});

test.describe('Taxonomy - delete', { tag: ['@regression'] }, () => {
  test(
    'Cancelling the delete confirmation keeps the term',
    { tag: ['@functional', '@mutates'] },
    async ({ taxonomyListPage: list, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);
      const deletes = list.countPostRequests('/taxonomy/taxonomy/delete');

      await list.openDeleteConfirmation(id);
      await expect(list.deleteDialog.message).toHaveText(taxonomyText.gridDeleteConfirm);
      await list.deleteDialog.cancel();

      await expect(list.deleteDialog.dialog).toBeHidden();
      await expect(list.row(id)).toBeVisible();
      expect(deletes()).toBe(0);
    },
  );

  test(
    'Confirming the delete removes the term from its list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ page, taxonomyListPage: list, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);

      await list.deleteTerm(id);

      await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
      await expect(list.row(id)).toHaveCount(0);
      expect(await list.idsOfTermsTitledEn(crud.key, term.titleEn)).toEqual([]);
    },
  );

  test(
    'Deleting a term shows a success message',
    { tag: ['@ui', '@mutates', '@known-bug'] },
    async ({ taxonomyListPage: list, createTaxonomyTerm }) => {
      test.fail(
        true,
        'BUG: Deleting a taxonomy term shows no message, while create and update both confirm ' +
          'with a success message.',
      );
      const id = await createTaxonomyTerm(crud.key, newTaxonomyTerm());

      await list.deleteTerm(id);

      await expect(list.successAlert).toContainText(taxonomyText.deleted);
    },
  );

  test(
    'Delete on the details page asks first, and only deletes when confirmed',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ page, taxonomyViewPage: view, taxonomyListPage: list, createTaxonomyTerm }) => {
      const term = newTaxonomyTerm();
      const id = await createTaxonomyTerm(crud.key, term);
      await view.goto(id);

      await test.step('Dismissing the confirmation keeps the term', async () => {
        const message = await view.deleteWithBrowserConfirm(false);
        expect(message).toBe(taxonomyText.detailsDeleteConfirm);
        await expect(page).toHaveURL(taxonomyUrls.view(id));
        await expect(view.idValue).toHaveText(id);
      });

      await test.step('Accepting it deletes the term', async () => {
        await view.deleteWithBrowserConfirm(true);
        await expect(page).toHaveURL(taxonomyUrls.list(crud.key));
        expect(await list.idsOfTermsTitledEn(crud.key, term.titleEn)).toEqual([]);
      });
    },
  );
});
