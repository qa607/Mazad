import { devRootSession, expect, test } from '@fixtures/test.fixture';
import {
  faqCategoryColumns,
  faqCategoryFilters,
  faqPermissions,
  faqQuestionColumns,
  faqQuestionFilters,
  faqText,
  faqUrls,
} from '@test-data/faq.data';
import { permissionReplies } from '@test-data/traffic-office.data';

/**
 * Mazad Backend > Help Center permissions: the Faq Categories and Faq Questions routes granted to
 * the superAdmin role reach a Super Admin user.
 *
 * Dev Root (this test's tab) takes the role's Help Center permissions away and grants them again,
 * checking the server's reply to each change and, after a reload, the checkboxes that show the
 * role's state (the two Ajax boxes are judged by the reply only). The keepRolePermissionsGranted
 * fixture grants all of them after the test, passed or failed, so superAdmin always ends with
 * full Help Center access. The Super Admin (SUPER_ADMIN_* in .env) then signs in in a fresh,
 * signed-out browser and opens both lists, their create forms, a record and its update form.
 * Nothing is saved as the Super Admin.
 */

// Dev Root tab signed in from the saved session, with no trace or video (see devRootSession).
// The Super Admin tab gets a masked screenshot on failure from its fixture.
test.use(devRootSession);

const { role, ajaxRoutes, displayedRoutes } = faqPermissions;
const routes = [...ajaxRoutes, ...displayedRoutes];

test.describe('Help Center FAQ - permissions', { tag: '@regression' }, () => {
  test(
    'Help Center permissions granted to superAdmin give a Super Admin full access to both FAQ modules',
    { tag: ['@functional', '@mutates'] },
    async ({
      page,
      keepRolePermissionsGranted,
      rolePermissionsPage: permissions,
      signInAsSuperAdmin,
      pagesOn,
    }) => {
      // 14 permissions are each changed twice, with page reloads, before the Super Admin checks.
      test.setTimeout(120_000);
      keepRolePermissionsGranted(role, routes);
      await permissions.gotoPermissions(role);

      await test.step(`Dev Root takes the Help Center permissions away from ${role}`, async () => {
        for (const route of routes) {
          expect(await permissions.setPermission(route, false), route).toBe(
            permissionReplies.removed,
          );
        }
        await page.reload();
        for (const route of displayedRoutes) {
          await expect(permissions.permission(route), route).not.toBeChecked();
        }
      });

      await test.step('Dev Root grants them again, saved after a reload', async () => {
        for (const route of routes) {
          expect(await permissions.setPermission(route, true), route).toBe(permissionReplies.added);
        }
        await page.reload();
        for (const route of displayedRoutes) {
          await expect(permissions.permission(route), route).toBeChecked();
        }
      });

      const signIn = await test.step('the Super Admin signs in in a fresh browser', async () => {
        const result = await signInAsSuperAdmin();
        expect(result.error, 'sign-in error').toBeNull();
        return result;
      });

      const tab = signIn.tab;
      const { faqCategoryPage: categories, faqQuestionPage: questions } = pagesOn(tab);

      await test.step('the sidebar shows Help Center > Faq Categories and Faq Questions', async () => {
        await categories.openFromSidebar(faqText.sidebarParent, faqText.categoriesSidebarLabel);
        await expect(tab).toHaveURL(faqUrls.categoryList);
        // On a Help Center page its menu stays open, showing both items.
        await expect(categories.sidebarLink).toHaveText(faqText.categoriesSidebarLabel);
        await expect(questions.sidebarLink).toHaveText(faqText.questionsSidebarLabel);
        await expect(questions.sidebarLink).toBeVisible();
      });

      await test.step('the categories list shows its search form and categories', async () => {
        await expect(categories.pageHeading).toHaveText(faqText.categoriesTitle);
        await expect(categories.filterLabels).toHaveText([...faqCategoryFilters]);
        await expect(categories.columnHeaders).toHaveText([...faqCategoryColumns]);
        await expect(categories.rows.first()).toBeVisible();
      });

      const categoryId = await categories.rowId(categories.rows.first());

      await test.step('the categories create form, a category and its update form open', async () => {
        await categories.openCreateForm();
        await expect(tab).toHaveURL(faqUrls.categoryCreate);
        await expect(categories.pageHeading).toHaveText(faqText.createCategoryTitle);
        await expect(categories.saveButton).toBeEnabled();

        await categories.gotoView(categoryId);
        await expect(tab).toHaveURL(faqUrls.categoryView);
        await expect(categories.details).toBeVisible();

        await categories.gotoUpdate(categoryId);
        await expect(tab).toHaveURL(faqUrls.categoryUpdate(categoryId));
        await expect(categories.nameEnInput).toBeEditable();
        await expect(categories.saveButton).toBeEnabled();
      });

      await test.step('the questions list shows its filters and questions', async () => {
        await questions.goto();
        await expect(tab).toHaveURL(faqUrls.questionList);
        await expect(questions.pageHeading).toHaveText(faqText.questionsTitle);
        await expect(questions.filterLabels).toHaveText([...faqQuestionFilters]);
        await expect(questions.columnHeaders).toHaveText([...faqQuestionColumns]);
        await expect(questions.rows.first()).toBeVisible();
      });

      const questionId = await questions.rowId(questions.rows.first());

      await test.step('the questions create form, a question and its update form open', async () => {
        await questions.openCreateForm();
        await expect(tab).toHaveURL(faqUrls.questionCreate);
        await expect(questions.pageHeading).toHaveText(faqText.createQuestionTitle);
        await expect(questions.saveAndPublishButton).toBeEnabled();

        await questions.gotoView(questionId);
        await expect(tab).toHaveURL(faqUrls.questionView);
        await expect(questions.details).toBeVisible();

        await questions.gotoUpdate(questionId);
        await expect(tab).toHaveURL(faqUrls.questionUpdate(questionId));
        await expect(questions.questionEnInput).toBeEditable();
        await expect(questions.saveAndPublishButton).toBeEnabled();
      });
    },
  );
});
