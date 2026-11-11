import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  editedFaqCategory,
  faqCategoryColumns,
  faqCategoryErrors,
  faqCategoryFilters,
  faqCategorySlug,
  faqIconFile,
  faqRowActions,
  faqSearchData,
  faqText,
  faqUrls,
  faqViewLabels,
  newFaqCategory,
} from '@test-data/faq.data';

/**
 * Mazad Backend > Help Center > Faq Categories: the list (search by Name, Name En and Created At,
 * Sorting, Reset) and the create, update and delete flows.
 *
 * Read-only tests use the existing categories. Tests that change data create their own
 * "QA-AUTO FAQ" categories (with a synthetic icon); the faqCleanup fixture deletes them
 * afterwards, whether the test passed or failed. The file runs in order in one worker.
 */

// Pages open already signed in as Dev Root, with no trace or video (see devRootSession).
test.use(devRootSession);
test.describe.configure({ mode: 'default' });

test.describe('Faq Categories - list', { tag: '@regression' }, () => {
  test.beforeEach(async ({ page, faqCategoryPage: list }) => {
    await list.goto();
    // A redirect to the login page here means the saved session was rejected or has expired.
    await expect(page).toHaveURL(faqUrls.categoryList);
  });

  test(
    'Opens from Help Center > Faq Categories in the sidebar',
    { tag: '@functional' },
    async ({ page, mazadDashboardPage, faqCategoryPage: list }) => {
      await mazadDashboardPage.goto();

      await list.openFromSidebar(faqText.sidebarParent, faqText.categoriesSidebarLabel);

      await expect(page).toHaveURL(faqUrls.categoryList);
      await expect(list.pageHeading).toHaveText(faqText.categoriesTitle);
    },
  );

  test(
    'Shows the search form, Sorting, Reset, Create Faq Category and the grid columns',
    { tag: ['@smoke', '@functional'] },
    async ({ page, faqCategoryPage: list }) => {
      await expect(page).toHaveTitle(faqText.categoriesTitle);
      await expect(list.filterLabels).toHaveText([...faqCategoryFilters]);
      await expect(list.createButton).toHaveText(faqText.createCategoryTitle);
      await expect(list.sortingButton).toBeVisible();
      await expect(list.resetButton).toBeVisible();
      await expect(list.columnHeaders).toHaveText([...faqCategoryColumns]);
      await expect(list.rows.first()).toBeVisible();
    },
  );

  test(
    'Every category has a Sort link and View, Update and Delete',
    { tag: '@functional' },
    async ({ faqCategoryPage: list }) => {
      for (const row of await list.rows.all()) {
        const id = await list.rowId(row);
        await expect(list.sortLink(row), `category ${id}`).toHaveAttribute(
          'href',
          `${faqText.orderingPath}?id=${id}`,
        );
        const actions = list.actionLinks(row);
        await expect(actions).toHaveCount(faqRowActions.length);
        for (const [index, name] of faqRowActions.entries()) {
          await expect(actions.nth(index)).toHaveAttribute('title', name);
        }
      }
    },
  );

  test(
    'Sorting opens the ordering page',
    { tag: '@functional' },
    async ({ page, faqCategoryPage: list }) => {
      await list.openSorting();

      await expect(page).toHaveURL(faqUrls.ordering);
    },
  );

  test(
    'Name En finds categories by part of the name, ignoring case',
    { tag: '@functional' },
    async ({ faqCategoryPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const part = faqSearchData.partialEn(await list.nameEnCell(row).innerText());

      await list.searchByNameEn(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.nameEnCells.all()) {
        expect((await cell.innerText()).toLowerCase()).toContain(part);
      }
    },
  );

  test(
    'Name finds categories by part of the Arabic name',
    { tag: '@functional' },
    async ({ faqCategoryPage: list }) => {
      const row = list.rows.first();
      const id = await list.rowId(row);
      const part = faqSearchData.partialAr(await list.nameCell(row).innerText());

      await list.searchByName(part);

      await expect(list.row(id)).toHaveCount(1);
      for (const cell of await list.nameCells.all()) {
        expect(await cell.innerText()).toContain(part);
      }
    },
  );

  test('An unknown name finds nothing', { tag: '@negative' }, async ({ faqCategoryPage: list }) => {
    await list.searchByNameEn(faqSearchData.unknown);

    await expect(list.rows).toHaveCount(0);
    await expect(list.emptyMessage).toHaveText(faqText.noResults);
  });

  test(
    'Reset clears the search',
    { tag: '@functional' },
    async ({ page, faqCategoryPage: list }) => {
      const total = await list.totalCount();
      await list.searchByNameEn(faqSearchData.unknown);
      await expect(list.emptyMessage).toBeVisible();

      await list.reset();

      await expect(page).toHaveURL(faqUrls.categoryList);
      await expect(list.nameEnSearchInput).toBeEmpty();
      expect(await list.totalCount()).toBe(total);
    },
  );
});

test.describe('Faq Categories - create, update and delete', { tag: '@regression' }, () => {
  test(
    'An empty form is rejected with a message for the icon and each name',
    { tag: '@negative' },
    async ({ page, faqCategoryPage: form }) => {
      await form.gotoCreate();
      const submissions = form.countPostRequests('/helpCenter/faq-category/create');

      await form.save();

      await expect(form.iconError).toHaveText(faqCategoryErrors.icon);
      await expect(form.nameError).toHaveText(faqCategoryErrors.name);
      await expect(form.nameEnError).toHaveText(faqCategoryErrors.nameEn);
      await expect(page).toHaveURL(faqUrls.categoryCreate);
      expect(submissions()).toBe(0);
    },
  );

  test(
    'Creates a category with an icon, shown on its View page and in the list',
    { tag: ['@smoke', '@crud', '@mutates'] },
    async ({ page, faqCategoryPage: categories, faqCleanup }) => {
      const category = newFaqCategory();
      faqCleanup.trackCategory(category.nameEn);

      await test.step('fill the form and save', async () => {
        await categories.goto();
        await categories.openCreateForm();
        await expect(page).toHaveURL(faqUrls.categoryCreate);
        await expect(categories.pageHeading).toHaveText(faqText.createCategoryTitle);
        await categories.uploadIcon(faqIconFile);
        await categories.fillForm(category);
        await categories.saveAndWaitForPageLoad();
      });

      const id = await test.step('its View page shows the names and the English slug', async () => {
        await expect(page).toHaveURL(faqUrls.categoryView);
        await expect(categories.pageHeading).toHaveText(category.name);
        await expect(categories.viewValue(faqViewLabels.name)).toHaveText(category.name);
        await expect(categories.viewValue(faqViewLabels.nameEn)).toHaveText(category.nameEn);
        await expect(categories.viewValue(faqViewLabels.slugEn)).toHaveText(
          faqCategorySlug(category.nameEn),
        );
        return categories.idFromViewUrl(category.nameEn);
      });

      await test.step('the list shows it', async () => {
        await categories.gotoSearch({ name_en: category.nameEn });
        await expect(categories.nameCell(categories.row(id))).toHaveText(category.name);
        await expect(categories.nameEnCell(categories.row(id))).toHaveText(category.nameEn);
      });
    },
  );

  test(
    'Created At "Today" lists a category created today',
    { tag: ['@functional', '@mutates'] },
    async ({ faqCategoryPage: list, createFaqCategory }) => {
      const category = newFaqCategory();
      const id = await createFaqCategory(category);
      await list.goto();

      await list.filterCreatedAt(faqText.todayRange);

      await expect(list.row(id)).toHaveCount(1);
      const today = (await list.createdAtRangeInput.inputValue()).split(' - ')[0];
      for (const cell of await list.createdAtCells.all()) {
        expect(await cell.innerText()).toMatch(new RegExp(`^${today}`));
      }
    },
  );

  test(
    'Updates the names, shown on the View page and in the list',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ page, faqCategoryPage: categories, createFaqCategory, faqCleanup }) => {
      const category = newFaqCategory();
      const edited = editedFaqCategory(category);
      faqCleanup.trackCategory(edited.nameEn);
      const id = await createFaqCategory(category);

      await categories.gotoUpdate(id);
      await expect(categories.pageHeading).toHaveText(faqText.updateTitle(category.name));
      await expect(categories.nameEnInput).toHaveValue(category.nameEn);
      await categories.fillForm(edited);
      await categories.saveAndWaitForPageLoad();

      await expect(page).toHaveURL(faqUrls.categoryView);
      await expect(categories.viewValue(faqViewLabels.name)).toHaveText(edited.name);
      await expect(categories.viewValue(faqViewLabels.nameEn)).toHaveText(edited.nameEn);
      await categories.gotoSearch({ name_en: edited.nameEn });
      await expect(categories.nameCell(categories.row(id))).toHaveText(edited.name);
    },
  );

  test(
    'Deletes a category from the grid after confirmation',
    { tag: ['@functional', '@crud', '@mutates'] },
    async ({ faqCategoryPage: categories, createFaqCategory }) => {
      const category = newFaqCategory();
      const id = await createFaqCategory(category);
      await categories.gotoSearch({ name_en: category.nameEn });

      await categories.openDeleteConfirmation(id);
      await expect(categories.deleteDialog.message).toHaveText(faqText.deleteConfirm);
      await categories.deleteDialog.confirmAndWaitForPageLoad();

      await expect(categories.successAlert).toContainText(faqText.categoryDeleted);
      await categories.gotoSearch({ name_en: category.nameEn });
      await expect(categories.rows).toHaveCount(0);
    },
  );
});
