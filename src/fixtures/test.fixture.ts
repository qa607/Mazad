import fs from 'node:fs';
import { test as base, expect, request as playwrightRequest, type Page } from '@playwright/test';
import {
  type BackendAccount,
  type BackendRole,
  DEV_ROOT_MISSING_REASON,
  DEV_ROOT_SESSION_FILE,
  ERP_MISSING_REASON,
  getDevRootAccount,
  getErpAccount,
  getRoleAccount,
  roleMissingReason,
  roleSessionFile,
} from '@config/credentials.config';
import { envConfig } from '@config/env.config';
import { ErpClient } from '@api/erp.client';
import { MazadApiClient } from '@api/mazad-api.client';
import { getTranslator, type Translator } from '@locales';
import { PermissionListPage } from '@pages/backend/access/permission-list.page';
import { RolePermissionsPage } from '@pages/backend/access/role-permissions.page';
import { SuperAdminFormPage } from '@pages/backend/admins/super-admin-form.page';
import { SuperAdminListPage } from '@pages/backend/admins/super-admin-list.page';
import { AwaitingPage } from '@pages/backend/auctions/awaiting.page';
import { CreateAuctionPage } from '@pages/backend/auctions/create-auction.page';
import { FailedPage } from '@pages/backend/auctions/failed.page';
import { LivePage } from '@pages/backend/auctions/live.page';
import { PricingDonePage } from '@pages/backend/auctions/pricing-done.page';
import { ReadyForPricingPage } from '@pages/backend/auctions/ready-for-pricing.page';
import { SuspendedVehiclesPage } from '@pages/backend/auctions/suspended-vehicles.page';
import { UpcomingPage } from '@pages/backend/auctions/upcoming.page';
import { WaitingApprovalPage } from '@pages/backend/auctions/waiting-approval.page';
import { MazadLoginPage } from '@pages/backend/auth/mazad-login.page';
import { CustomerGroupFormPage } from '@pages/backend/customer-group/customer-group-form.page';
import { CustomerGroupListPage } from '@pages/backend/customer-group/customer-group-list.page';
import { CustomerGroupMembersPage } from '@pages/backend/customer-group/customer-group-members.page';
import { DealerFormPage } from '@pages/backend/customers/dealer-form.page';
import { DealerListPage } from '@pages/backend/customers/dealer-list.page';
import { DeletedUserListPage } from '@pages/backend/customers/deleted-user-list.page';
import { QcListPage } from '@pages/backend/qc/qc-list.page';
import { QcViewPage } from '@pages/backend/qc/qc-view.page';
import { IndividualListPage } from '@pages/backend/customers/individual-list.page';
import { CustomerGroupViewPage } from '@pages/backend/customer-group/customer-group-view.page';
import { MazadDashboardPage } from '@pages/backend/dashboard/mazad-dashboard.page';
import { OperationFormPage } from '@pages/backend/operations/operation-form.page';
import { OperationListPage } from '@pages/backend/operations/operation-list.page';
import { MazadSoldListPage } from '@pages/backend/mazad-sold-list.page';
import { MazadVehicleViewPage } from '@pages/backend/mazad-vehicle-view.page';
import { AuctionClosedReportPage } from '@pages/backend/reports/auction-closed-report.page';
import { PurchaseSurveyReportPage } from '@pages/backend/reports/purchase-survey-report.page';
import { SupplierVehicleReportPage } from '@pages/backend/reports/supplier-vehicle-report.page';
import { VehiclesReportPage } from '@pages/backend/reports/vehicles-report.page';
import { MojazRequestReportPage } from '@pages/backend/reports/mojaz-request-report.page';
import { CarCancellationPage } from '@pages/backend/request-cancellation/car-cancellation.page';
import { AdvertisementPage } from '@pages/backend/content/advertisement.page';
import { ConfirmDeliverySurveyPage } from '@pages/backend/survey/confirm-delivery-survey.page';
import { ContactUsPage } from '@pages/backend/content/contact-us.page';
import { SupplierAuctionInfoPage } from '@pages/backend/suppliers/supplier-auction-info.page';
import { SupplierCompanyFormPage } from '@pages/backend/suppliers/supplier-company-form.page';
import { SupplierCompanyListPage } from '@pages/backend/suppliers/supplier-company-list.page';
import { SupplierFormPage } from '@pages/backend/suppliers/supplier-form.page';
import { SupplierListPage } from '@pages/backend/suppliers/supplier-list.page';
import { SupplierMemberFormPage } from '@pages/backend/suppliers/supplier-member-form.page';
import { SupplierMemberListPage } from '@pages/backend/suppliers/supplier-member-list.page';
import { SupplierViewPage } from '@pages/backend/suppliers/supplier-view.page';
import { TaxonomyFormPage } from '@pages/backend/taxonomy/taxonomy-form.page';
import { TaxonomyListPage } from '@pages/backend/taxonomy/taxonomy-list.page';
import { TaxonomyTypesPage } from '@pages/backend/taxonomy/taxonomy-types.page';
import { TaxonomyViewPage } from '@pages/backend/taxonomy/taxonomy-view.page';
import type { TaxonomyTermData } from '@test-data/taxonomy.data';
import type { Language } from '@typings';

/** Options set per project in playwright.config.ts. */
export interface LanguageOptions {
  language: Language;
}

/** Options set per spec with test.use(). */
export interface SessionOptions {
  /**
   * 'devRoot' opens every page already signed in as Dev Root, reusing the session saved once
   * per run by tests/backend/auth.setup.ts. A role key (see BACKEND_ROLES) does the same with
   * that role's test account. Default 'none': a fresh, signed-out browser.
   */
  signedInAs: 'none' | 'devRoot' | BackendRole;
}

/**
 * test.use() settings for specs whose pages open signed in as Dev Root. Traces, videos and
 * automatic screenshots would capture the session and the account header, so they are off;
 * a failing test attaches a screenshot with account details masked instead.
 */
export const devRootSession = {
  signedInAs: 'devRoot',
  trace: 'off',
  video: 'off',
  screenshot: 'off',
} as const;

/** Back-office page objects for one browser tab. */
export interface BackendPages {
  mazadLoginPage: MazadLoginPage;
  mazadDashboardPage: MazadDashboardPage;
  operationListPage: OperationListPage;
  operationFormPage: OperationFormPage;
  mazadSoldListPage: MazadSoldListPage;
  mazadVehicleViewPage: MazadVehicleViewPage;
  suspendedVehiclesPage: SuspendedVehiclesPage;
  readyForPricingPage: ReadyForPricingPage;
  pricingDonePage: PricingDonePage;
  upcomingPage: UpcomingPage;
  createAuctionPage: CreateAuctionPage;
  awaitingPage: AwaitingPage;
  livePage: LivePage;
  failedPage: FailedPage;
  waitingApprovalPage: WaitingApprovalPage;
  auctionClosedReportPage: AuctionClosedReportPage;
  purchaseSurveyReportPage: PurchaseSurveyReportPage;
  supplierVehicleReportPage: SupplierVehicleReportPage;
  vehiclesReportPage: VehiclesReportPage;
  mojazRequestReportPage: MojazRequestReportPage;
  carCancellationPage: CarCancellationPage;
  contactUsPage: ContactUsPage;
  advertisementPage: AdvertisementPage;
  confirmDeliverySurveyPage: ConfirmDeliverySurveyPage;
  supplierListPage: SupplierListPage;
  supplierFormPage: SupplierFormPage;
  supplierViewPage: SupplierViewPage;
  superAdminListPage: SuperAdminListPage;
  superAdminFormPage: SuperAdminFormPage;
  supplierAuctionInfoPage: SupplierAuctionInfoPage;
  supplierCompanyListPage: SupplierCompanyListPage;
  supplierCompanyFormPage: SupplierCompanyFormPage;
  supplierMemberListPage: SupplierMemberListPage;
  supplierMemberFormPage: SupplierMemberFormPage;
  rolePermissionsPage: RolePermissionsPage;
  permissionListPage: PermissionListPage;
  customerGroupListPage: CustomerGroupListPage;
  customerGroupFormPage: CustomerGroupFormPage;
  customerGroupViewPage: CustomerGroupViewPage;
  customerGroupMembersPage: CustomerGroupMembersPage;
  individualListPage: IndividualListPage;
  dealerListPage: DealerListPage;
  dealerFormPage: DealerFormPage;
  deletedUserListPage: DeletedUserListPage;
  qcListPage: QcListPage;
  qcViewPage: QcViewPage;
  taxonomyTypesPage: TaxonomyTypesPage;
  taxonomyListPage: TaxonomyListPage;
  taxonomyFormPage: TaxonomyFormPage;
  taxonomyViewPage: TaxonomyViewPage;
}

function createBackendPages(page: Page): BackendPages {
  return {
    mazadLoginPage: new MazadLoginPage(page),
    mazadDashboardPage: new MazadDashboardPage(page),
    operationListPage: new OperationListPage(page),
    operationFormPage: new OperationFormPage(page),
    mazadSoldListPage: new MazadSoldListPage(page),
    mazadVehicleViewPage: new MazadVehicleViewPage(page),
    suspendedVehiclesPage: new SuspendedVehiclesPage(page),
    readyForPricingPage: new ReadyForPricingPage(page),
    pricingDonePage: new PricingDonePage(page),
    upcomingPage: new UpcomingPage(page),
    createAuctionPage: new CreateAuctionPage(page),
    awaitingPage: new AwaitingPage(page),
    livePage: new LivePage(page),
    failedPage: new FailedPage(page),
    waitingApprovalPage: new WaitingApprovalPage(page),
    auctionClosedReportPage: new AuctionClosedReportPage(page),
    purchaseSurveyReportPage: new PurchaseSurveyReportPage(page),
    supplierVehicleReportPage: new SupplierVehicleReportPage(page),
    vehiclesReportPage: new VehiclesReportPage(page),
    mojazRequestReportPage: new MojazRequestReportPage(page),
    carCancellationPage: new CarCancellationPage(page),
    contactUsPage: new ContactUsPage(page),
    advertisementPage: new AdvertisementPage(page),
    confirmDeliverySurveyPage: new ConfirmDeliverySurveyPage(page),
    supplierListPage: new SupplierListPage(page),
    supplierFormPage: new SupplierFormPage(page),
    supplierViewPage: new SupplierViewPage(page),
    superAdminListPage: new SuperAdminListPage(page),
    superAdminFormPage: new SuperAdminFormPage(page),
    supplierAuctionInfoPage: new SupplierAuctionInfoPage(page),
    supplierCompanyListPage: new SupplierCompanyListPage(page),
    supplierCompanyFormPage: new SupplierCompanyFormPage(page),
    supplierMemberListPage: new SupplierMemberListPage(page),
    supplierMemberFormPage: new SupplierMemberFormPage(page),
    rolePermissionsPage: new RolePermissionsPage(page),
    permissionListPage: new PermissionListPage(page),
    customerGroupListPage: new CustomerGroupListPage(page),
    customerGroupFormPage: new CustomerGroupFormPage(page),
    customerGroupViewPage: new CustomerGroupViewPage(page),
    customerGroupMembersPage: new CustomerGroupMembersPage(page),
    individualListPage: new IndividualListPage(page),
    dealerListPage: new DealerListPage(page),
    dealerFormPage: new DealerFormPage(page),
    deletedUserListPage: new DeletedUserListPage(page),
    qcListPage: new QcListPage(page),
    qcViewPage: new QcViewPage(page),
    taxonomyTypesPage: new TaxonomyTypesPage(page),
    taxonomyListPage: new TaxonomyListPage(page),
    taxonomyFormPage: new TaxonomyFormPage(page),
    taxonomyViewPage: new TaxonomyViewPage(page),
  };
}

interface MazadFixtures extends BackendPages {
  /** Translator for the active language, for text assertions in tests. */
  t: Translator;
  /** Dev Root staging account from .env. Tests using it are skipped when it is not set. */
  devRoot: BackendAccount;
  /** Page objects for another tab, such as one opened by a grid row action. */
  pagesOn: (tab: Page) => BackendPages;
  /**
   * Automatic: when automatic screenshots are off (because the page can show credentials or
   * account details), a failing test attaches a screenshot with those areas masked.
   */
  maskedFailureScreenshot: void;
  /**
   * Records the names of customer groups a test creates; after the test (passed or failed) every
   * group with one of those names is deleted through the list page.
   */
  customerGroupCleanup: { track: (name: string) => void };
  /**
   * Records the taxonomy terms a test creates (type key and Title En); after the test (passed or
   * failed) every term of that type with that Title En is deleted through its list page.
   */
  taxonomyCleanup: { track: (type: string, titleEn: string) => void };
  /**
   * Creates a taxonomy term through the form, registers it for clean-up and returns its id.
   * For tests that need an existing term; tests of the create flow itself use the form page.
   */
  createTaxonomyTerm: (type: string, data: TaxonomyTermData) => Promise<string>;
  /**
   * A back office session signed in as Dev Root, made read-only: after login every request
   * that is not a GET (except logout) is aborted, so tests cannot change back office data.
   * On failure it attaches a screenshot with account details masked.
   */
  backendSession: void;
  /** Mazad customer API client (guest calls). */
  mazadApi: MazadApiClient;
  /** Read-only ERP client, signed in from .env. Skips the test when the ERP is not configured. */
  erp: ErpClient;
}

export const test = base.extend<LanguageOptions & SessionOptions & MazadFixtures>({
  language: ['en', { option: true }],
  signedInAs: ['none', { option: true }],
  storageState: async ({ signedInAs, storageState }, use, testInfo) => {
    if (signedInAs === 'none') return use(storageState);

    if (signedInAs !== 'devRoot') {
      testInfo.skip(!getRoleAccount(signedInAs), roleMissingReason(signedInAs));
      const sessionFile = roleSessionFile(signedInAs);
      if (!fs.existsSync(sessionFile)) {
        throw new Error(
          `No saved session for role "${signedInAs}": its sign-in step in "backend-setup" ` +
            'failed or did not run. Run the "backend" project and check the setup step passed.',
        );
      }
      return use(sessionFile);
    }

    testInfo.skip(!getDevRootAccount(), DEV_ROOT_MISSING_REASON);
    if (!fs.existsSync(DEV_ROOT_SESSION_FILE)) {
      throw new Error(
        'No saved Dev Root session: the "backend-setup" project signs in first. ' +
          'Run the "backend" project (it depends on backend-setup) rather than this file alone ' +
          'with --no-deps, and check the setup step passed.',
      );
    }
    await use(DEV_ROOT_SESSION_FILE);
  },
  t: async ({ language }, use) => {
    await use(getTranslator(language));
  },
  mazadLoginPage: async ({ page }, use) => {
    await use(new MazadLoginPage(page));
  },
  mazadDashboardPage: async ({ page }, use) => {
    await use(new MazadDashboardPage(page));
  },
  operationListPage: async ({ page }, use) => {
    await use(new OperationListPage(page));
  },
  operationFormPage: async ({ page }, use) => {
    await use(new OperationFormPage(page));
  },
  mazadSoldListPage: async ({ page }, use) => {
    await use(new MazadSoldListPage(page));
  },
  mazadVehicleViewPage: async ({ page }, use) => {
    await use(new MazadVehicleViewPage(page));
  },
  suspendedVehiclesPage: async ({ page }, use) => {
    await use(new SuspendedVehiclesPage(page));
  },
  readyForPricingPage: async ({ page }, use) => {
    await use(new ReadyForPricingPage(page));
  },
  pricingDonePage: async ({ page }, use) => {
    await use(new PricingDonePage(page));
  },
  upcomingPage: async ({ page }, use) => {
    await use(new UpcomingPage(page));
  },
  createAuctionPage: async ({ page }, use) => {
    await use(new CreateAuctionPage(page));
  },
  awaitingPage: async ({ page }, use) => {
    await use(new AwaitingPage(page));
  },
  livePage: async ({ page }, use) => {
    await use(new LivePage(page));
  },
  failedPage: async ({ page }, use) => {
    await use(new FailedPage(page));
  },
  supplierListPage: async ({ page }, use) => {
    await use(new SupplierListPage(page));
  },
  supplierFormPage: async ({ page }, use) => {
    await use(new SupplierFormPage(page));
  },
  supplierViewPage: async ({ page }, use) => {
    await use(new SupplierViewPage(page));
  },
  superAdminListPage: async ({ page }, use) => {
    await use(new SuperAdminListPage(page));
  },
  superAdminFormPage: async ({ page }, use) => {
    await use(new SuperAdminFormPage(page));
  },
  supplierAuctionInfoPage: async ({ page }, use) => {
    await use(new SupplierAuctionInfoPage(page));
  },
  supplierCompanyListPage: async ({ page }, use) => {
    await use(new SupplierCompanyListPage(page));
  },
  supplierCompanyFormPage: async ({ page }, use) => {
    await use(new SupplierCompanyFormPage(page));
  },
  supplierMemberListPage: async ({ page }, use) => {
    await use(new SupplierMemberListPage(page));
  },
  supplierMemberFormPage: async ({ page }, use) => {
    await use(new SupplierMemberFormPage(page));
  },
  waitingApprovalPage: async ({ page }, use) => {
    await use(new WaitingApprovalPage(page));
  },
  auctionClosedReportPage: async ({ page }, use) => {
    await use(new AuctionClosedReportPage(page));
  },
  purchaseSurveyReportPage: async ({ page }, use) => {
    await use(new PurchaseSurveyReportPage(page));
  },
  supplierVehicleReportPage: async ({ page }, use) => {
    await use(new SupplierVehicleReportPage(page));
  },
  vehiclesReportPage: async ({ page }, use) => {
    await use(new VehiclesReportPage(page));
  },
  mojazRequestReportPage: async ({ page }, use) => {
    await use(new MojazRequestReportPage(page));
  },
  carCancellationPage: async ({ page }, use) => {
    await use(new CarCancellationPage(page));
  },
  contactUsPage: async ({ page }, use) => {
    await use(new ContactUsPage(page));
  },
  advertisementPage: async ({ page }, use) => {
    await use(new AdvertisementPage(page));
  },
  confirmDeliverySurveyPage: async ({ page }, use) => {
    await use(new ConfirmDeliverySurveyPage(page));
  },
  rolePermissionsPage: async ({ page }, use) => {
    await use(new RolePermissionsPage(page));
  },
  permissionListPage: async ({ page }, use) => {
    await use(new PermissionListPage(page));
  },
  customerGroupListPage: async ({ page }, use) => {
    await use(new CustomerGroupListPage(page));
  },
  customerGroupFormPage: async ({ page }, use) => {
    await use(new CustomerGroupFormPage(page));
  },
  customerGroupViewPage: async ({ page }, use) => {
    await use(new CustomerGroupViewPage(page));
  },
  customerGroupMembersPage: async ({ page }, use) => {
    await use(new CustomerGroupMembersPage(page));
  },
  individualListPage: async ({ page }, use) => {
    await use(new IndividualListPage(page));
  },
  dealerListPage: async ({ page }, use) => {
    await use(new DealerListPage(page));
  },
  dealerFormPage: async ({ page }, use) => {
    await use(new DealerFormPage(page));
  },
  deletedUserListPage: async ({ page }, use) => {
    await use(new DeletedUserListPage(page));
  },
  qcListPage: async ({ page }, use) => {
    await use(new QcListPage(page));
  },
  qcViewPage: async ({ page }, use) => {
    await use(new QcViewPage(page));
  },
  taxonomyTypesPage: async ({ page }, use) => {
    await use(new TaxonomyTypesPage(page));
  },
  taxonomyListPage: async ({ page }, use) => {
    await use(new TaxonomyListPage(page));
  },
  taxonomyFormPage: async ({ page }, use) => {
    await use(new TaxonomyFormPage(page));
  },
  taxonomyViewPage: async ({ page }, use) => {
    await use(new TaxonomyViewPage(page));
  },
  taxonomyCleanup: async ({ taxonomyListPage }, use) => {
    const terms = new Map<string, { type: string; titleEn: string }>();
    await use({
      track: (type, titleEn) => terms.set(`${type}|${titleEn.trim()}`, { type, titleEn }),
    });
    for (const { type, titleEn } of terms.values()) {
      await taxonomyListPage.deleteTermsTitledEn(type, titleEn);
    }
  },
  createTaxonomyTerm: async ({ taxonomyFormPage, taxonomyListPage, taxonomyCleanup }, use) => {
    await use(async (type, data) => {
      taxonomyCleanup.track(type, data.titleEn);
      await taxonomyFormPage.createTerm(type, data);
      return taxonomyListPage.idOfTermTitledEn(type, data.titleEn);
    });
  },
  customerGroupCleanup: async ({ customerGroupListPage }, use) => {
    const names = new Set<string>();
    await use({ track: (name) => names.add(name) });
    for (const name of names) await customerGroupListPage.deleteGroupsNamed(name);
  },
  // eslint-disable-next-line no-empty-pattern
  pagesOn: async ({}, use) => {
    await use(createBackendPages);
  },
  // eslint-disable-next-line no-empty-pattern
  devRoot: async ({}, use, testInfo) => {
    const account = getDevRootAccount();
    testInfo.skip(!account, DEV_ROOT_MISSING_REASON);
    if (!account) return; // Not reached: skip() ends the test.
    await use(account);
  },
  backendSession: async ({ page, devRoot, mazadLoginPage, mazadDashboardPage }, use, testInfo) => {
    await mazadLoginPage.goto();
    await mazadLoginPage.loginAs(devRoot);
    await mazadDashboardPage.userMenuToggle.waitFor();

    await page.route('**/*', async (route) => {
      const req = route.request();
      const allowed = req.method() === 'GET' || req.url().includes('/authentication/logout');
      await (allowed ? route.fallback() : route.abort('blockedbyclient'));
    });

    await use();

    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshot = await page
        .screenshot({
          fullPage: false,
          mask: [...mazadLoginPage.sensitiveAreas(), ...mazadDashboardPage.sensitiveAreas()],
        })
        .catch(() => null);
      if (screenshot) {
        await testInfo.attach('screenshot (account details masked)', {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    }
    // Log out from the dashboard, within a fixed budget so teardown never eats the test timeout.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await Promise.race([
      (async () => {
        await mazadDashboardPage.goto();
        await mazadDashboardPage.logout();
        await page.waitForURL(/\/authentication\/login/);
      })(),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]).catch(() => undefined);
  },
  mazadApi: async ({ request }, use) => {
    await use(new MazadApiClient(request));
  },
  // eslint-disable-next-line no-empty-pattern
  erp: async ({}, use, testInfo) => {
    const account = getErpAccount();
    testInfo.skip(!envConfig.erpURL, `No erpURL configured for environment "${envConfig.name}".`);
    testInfo.skip(!account, ERP_MISSING_REASON);
    if (!account || !envConfig.erpURL) return; // Not reached: skip() ends the test.

    const context = await playwrightRequest.newContext({ baseURL: envConfig.erpURL });
    const client = new ErpClient(context);
    await client.login(account);
    await use(client);
    await client.logout();
    await context.dispose();
  },
  maskedFailureScreenshot: [
    async ({ page, screenshot }, use, testInfo) => {
      await use();
      const mode = typeof screenshot === 'string' ? screenshot : screenshot.mode;
      if (mode !== 'off' || testInfo.status === testInfo.expectedStatus) return;
      const login = new MazadLoginPage(page);
      const dashboard = new MazadDashboardPage(page);
      const image = await page
        .screenshot({
          fullPage: true,
          mask: [...login.sensitiveAreas(), ...dashboard.sensitiveAreas()],
        })
        .catch(() => null);
      if (image) {
        await testInfo.attach('screenshot (account details masked)', {
          body: image,
          contentType: 'image/png',
        });
      }
    },
    { auto: true },
  ],
});

export { expect };
